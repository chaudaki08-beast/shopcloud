/**
 * ShopCloud Kubernetes Manifests Static & Security Validator
 * Validates YAML syntax, required K8s schemas, PSS restricted security contexts,
 * resource requests/limits, health probes, and secret cleanliness.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const K8S_ROOT = path.join(__dirname, '..', 'infra', 'kubernetes');

let totalChecks = 0;
let passedChecks = 0;
let failures = [];

function check(description, condition, details = '') {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ✅ PASS: ${description}`);
  } else {
    failures.push({ description, details });
    console.error(`  ❌ FAIL: ${description} - ${details}`);
  }
}

function getAllYamlFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllYamlFiles(fullPath));
    } else if (file.endsWith('.yaml') || file.endsWith('.yml')) {
      results.push(fullPath);
    }
  });
  return results;
}

console.log('🔍 Starting ShopCloud Kubernetes Manifests & Security Audit...\n');

// 1. Scan and Parse All Manifests
const yamlFiles = getAllYamlFiles(K8S_ROOT);
console.log(`[1/5] Validating YAML Syntax across ${yamlFiles.length} manifest files...`);

const parsedDocs = [];

for (const file of yamlFiles) {
  const relativePath = path.relative(path.join(__dirname, '..'), file);
  try {
    const content = fs.readFileSync(file, 'utf8');
    const docs = yaml.loadAll(content);
    check(`YAML Syntax in ${relativePath}`, true);
    for (const doc of docs) {
      if (doc) {
        parsedDocs.push({ file: relativePath, doc });
      }
    }
  } catch (err) {
    check(`YAML Syntax in ${relativePath}`, false, err.message);
  }
}

// 2. Validate Kustomization File References
console.log('\n[2/5] Validating Kustomization References...');
const kustomizationFiles = yamlFiles.filter((f) => f.endsWith('kustomization.yaml'));

for (const kf of kustomizationFiles) {
  const dir = path.dirname(kf);
  const relativePath = path.relative(path.join(__dirname, '..'), kf);
  const content = fs.readFileSync(kf, 'utf8');
  const doc = yaml.load(content);

  if (doc && doc.resources) {
    for (const res of doc.resources) {
      const targetPath = path.resolve(dir, res);
      const exists = fs.existsSync(targetPath);
      check(
        `Kustomize resource '${res}' exists in ${relativePath}`,
        exists,
        `Target path not found: ${targetPath}`,
      );
    }
  }
}

// 3. Validate Workload Deployments (SecurityContext, Probes, Resources, Images)
console.log('\n[3/5] Validating Workload Deployments against PSS Restricted & Reliability Standards...');

const deployments = parsedDocs.filter((p) => p.doc && p.doc.kind === 'Deployment');

for (const { file, doc } of deployments) {
  const isPatch = file.includes('patch.yaml');
  const name = doc.metadata?.name || 'unknown';
  const podSpec = doc.spec?.template?.spec;
  const containers = podSpec?.containers || [];

  console.log(`  Evaluating Deployment: ${name} (${file})${isPatch ? ' [Kustomize Patch Fragment]' : ''}`);

  if (!isPatch) {
    // Deployment Replicas & Strategy (Base Deployments Only)
    check(
      `${name} defines replicas >= 1`,
      doc.spec && typeof doc.spec.replicas === 'number' && doc.spec.replicas >= 1,
      `Replicas: ${doc.spec?.replicas}`,
    );
    check(
      `${name} defines RollingUpdate strategy`,
      doc.spec?.strategy?.type === 'RollingUpdate',
      `Strategy: ${doc.spec?.strategy?.type}`,
    );
    check(
      `${name} defines terminationGracePeriodSeconds >= 15`,
      podSpec && podSpec.terminationGracePeriodSeconds >= 15,
      `Grace period: ${podSpec?.terminationGracePeriodSeconds}`,
    );

    // Pod Security Context
    const podSec = podSpec?.securityContext || {};
    check(
      `${name} specifies seccompProfile RuntimeDefault`,
      podSec.seccompProfile?.type === 'RuntimeDefault',
    );
  }

  for (const c of containers) {
    const cName = c.name || 'unnamed';
    const cSec = c.securityContext || {};

    // Non-root & Capability Dropping
    check(
      `${name}:${cName} sets allowPrivilegeEscalation: false`,
      cSec.allowPrivilegeEscalation === false,
    );
    check(
      `${name}:${cName} drops ALL Linux capabilities`,
      Array.isArray(cSec.capabilities?.drop) && cSec.capabilities.drop.includes('ALL'),
    );

    // Resources
    const res = c.resources || {};
    check(
      `${name}:${cName} defines CPU & Memory requests`,
      Boolean(res.requests?.cpu && res.requests?.memory),
      `Requests: ${JSON.stringify(res.requests)}`,
    );
    check(
      `${name}:${cName} defines CPU & Memory limits`,
      Boolean(res.limits?.cpu && res.limits?.memory),
      `Limits: ${JSON.stringify(res.limits)}`,
    );

    // Health Probes
    check(
      `${name}:${cName} defines livenessProbe`,
      Boolean(c.livenessProbe && (c.livenessProbe.httpGet || c.livenessProbe.exec)),
    );
    check(
      `${name}:${cName} defines readinessProbe`,
      Boolean(c.readinessProbe && (c.readinessProbe.httpGet || c.readinessProbe.exec)),
    );

    // Image Tags (no naked :latest)
    if (c.image) {
      check(
        `${name}:${cName} does not use unversioned latest image tag`,
        !c.image.endsWith(':latest'),
        `Image: ${c.image}`,
      );
    }
  }
}

// 4. Validate Services & Ingress
console.log('\n[4/5] Validating Services & Ingress Configurations...');
const services = parsedDocs.filter((p) => p.doc && p.doc.kind === 'Service');
for (const { file, doc } of services) {
  const name = doc.metadata?.name;
  check(
    `Service ${name} defines selector`,
    Boolean(doc.spec?.selector && Object.keys(doc.spec.selector).length > 0),
  );
  check(
    `Service ${name} defines valid TCP ports`,
    Array.isArray(doc.spec?.ports) && doc.spec.ports.every((p) => p.port > 0),
  );
}

const ingresses = parsedDocs.filter((p) => p.doc && p.doc.kind === 'Ingress');
for (const { file, doc } of ingresses) {
  const name = doc.metadata?.name;
  check(
    `Ingress ${name} defines path rules`,
    Boolean(doc.spec?.rules && doc.spec.rules.length > 0),
  );
}

// 5. Validate Zero Plaintext Secrets Leakage
console.log('\n[5/5] Auditing Secrets for Zero Plaintext Leakage...');
const secrets = parsedDocs.filter((p) => p.doc && p.doc.kind === 'Secret');
for (const { file, doc } of secrets) {
  const rawContent = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  // Check that no real production secrets or private keys are committed
  check(
    `Secret in ${file} does not contain real RSA/EC private keys`,
    !rawContent.includes('BEGIN PRIVATE KEY') && !rawContent.includes('BEGIN RSA PRIVATE KEY'),
  );
  check(
    `Secret in ${file} does not contain real GCP service account JSON`,
    !rawContent.includes('"type": "service_account"'),
  );
}

// Summary
console.log('\n' + '='.repeat(80));
console.log(`Kubernetes Manifest Validation Completed: ${passedChecks}/${totalChecks} Checks Passed.`);
console.log('='.repeat(80));

if (failures.length > 0) {
  console.error(`\n❌ ${failures.length} Check(s) Failed:\n`);
  failures.forEach((f, idx) => {
    console.error(`  ${idx + 1}. ${f.description} — ${f.details}`);
  });
  process.exit(1);
} else {
  console.log('\n🎉 ALL KUBERNETES MANIFESTS, SCHEMAS & SECURITY CHECKS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}
