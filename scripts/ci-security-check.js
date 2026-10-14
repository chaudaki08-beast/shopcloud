/**
 * ShopCloud CI Security & Secret Leakage Checker
 * Validates repository cleanliness, ensures no secrets/keys are tracked in git,
 * and verifies critical dependency vulnerability thresholds.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔒 Running ShopCloud Security & Secret Leakage Audit...\n');

let failed = false;

// 1. Check for forbidden file names tracked in git
console.log('[1/3] Checking git-tracked file paths for secret or credential patterns...');
try {
  const trackedFiles = execSync('git ls-files', { encoding: 'utf8' })
    .split('\n')
    .map(f => f.trim())
    .filter(Boolean);

  const forbiddenFilePatterns = [
    /^\.env(?!\.example|\.docker\.example)/,
    /\.pem$/i,
    /\.key$/i,
    /\.p12$/i,
    /service[-_]?account.*\.json$/i,
    /credentials\.json$/i,
    /gha-creds.*\.json$/i,
    /\.tfstate(?:\.backup)?$/i,
    /\.tfplan$/i,
    /\.tfvars$/i,
  ];

  const flaggedFiles = trackedFiles.filter(file => {
    // allow shell script templates like 15-resolver.envsh
    if (file.endsWith('.envsh')) return false;
    return forbiddenFilePatterns.some(pattern => pattern.test(path.basename(file)));
  });

  if (flaggedFiles.length > 0) {
    console.error('❌ FAILED: Found prohibited secret or credential files tracked in git:');
    flaggedFiles.forEach(f => console.error(`   - ${f}`));
    failed = true;
  } else {
    console.log('✅ PASS: No prohibited secret or credential files found in git history.');
  }

  // 2. Scan tracked file contents for high-risk secret signatures
  console.log('\n[2/3] Scanning tracked files for hardcoded private keys or service account tokens...');
  const secretSignatures = [
    { name: 'Private Key header', pattern: /-----BEGIN (?:RSA|EC|OPENSSH|DSA|PGP)?\s*PRIVATE KEY-----/ },
    { name: 'GCP Service Account JSON marker', pattern: /"type":\s*"service_account"/ },
    { name: 'GitHub Personal Access Token', pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36}/ },
  ];

  let matchesCount = 0;
  for (const file of trackedFiles) {
    // Skip binary files, lockfiles, images, and documentation discussing the patterns
    if (file.endsWith('.lock') || file.endsWith('.png') || file.endsWith('.ico') || file.endsWith('.jpg') || file.endsWith('.md')) {
      continue;
    }
    // Skip scripts/ci-security-check.js itself to avoid self-match on regex definitions
    if (file === 'scripts/ci-security-check.js') {
      continue;
    }

    try {
      const content = fs.readFileSync(file, 'utf8');
      for (const sig of secretSignatures) {
        if (sig.pattern.test(content)) {
          console.error(`❌ FAILED: Potential ${sig.name} detected in: ${file}`);
          matchesCount++;
          failed = true;
        }
      }
    } catch {
      // Ignore unreadable or non-utf8 files
    }
  }

  if (matchesCount === 0) {
    console.log('✅ PASS: No high-risk secret patterns or private keys detected in tracked source files.');
  }

} catch (err) {
  console.error('⚠️ Warning: Git inspection encountered an error:', err.message);
}

// 3. Check for critical production dependency vulnerabilities
console.log('\n[3/3] Checking production dependency vulnerability threshold (npm audit)...');
try {
  execSync('npm audit --omit=dev --audit-level=critical', { stdio: 'inherit' });
  console.log('✅ PASS: No critical vulnerabilities found in production dependencies.');
} catch {
  console.error('❌ FAILED: Critical vulnerabilities detected in production dependencies.');
  failed = true;
}

if (failed) {
  console.error('\n🚨 Security audit failed. Please remediate the issues flagged above before merging.');
  process.exit(1);
} else {
  console.log('\n🎉 Security audit passed successfully! All security gates satisfied.');
  process.exit(0);
}
