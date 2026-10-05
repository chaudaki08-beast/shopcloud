import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List and filter products with pagination and sorting (Public)' })
  @ApiResponse({ status: 200, description: 'Paginated list of products returned' })
  async findAll(@Query() query: ProductQueryDto) {
    return this.productsService.findAll(query);
  }

  @Get('categories')
  @Public()
  @ApiOperation({ summary: 'Get product categories (Public)' })
  @ApiResponse({ status: 200, description: 'Array of categories returned' })
  async getCategories() {
    return this.productsService.getCategories();
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a product by ID or URL slug (Public)' })
  @ApiParam({ name: 'id', description: 'Product UUID or unique slug' })
  @ApiResponse({ status: 200, description: 'Product details returned' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findOne(@Param('id') id: string) {
    return this.productsService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('products:create')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new product (Admin only)' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid product input' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  @ApiResponse({ status: 409, description: 'SKU conflict' })
  async create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('products:update')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Partially update a product (Admin & Inventory)' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 409, description: 'SKU conflict' })
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('products:update')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update a product (PUT alias)' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  async updatePut(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('products:delete')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Deactivate / delete a product (Admin only)' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'Product removed' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }

  // --- Product Image Endpoints (Phase 9 - Cloud Storage) ---

  @Post(':id/images')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('products:update')
  @ApiBearerAuth('JWT-auth')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a product image to Cloud Storage (Admin & Inventory)' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Image file (JPEG, PNG, WEBP, max 5MB)' },
        altText: { type: 'string', description: 'Alternative description text' },
        isPrimary: { type: 'boolean', description: 'Set as primary product image' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Image uploaded and attached to product' })
  @ApiResponse({ status: 400, description: 'Invalid file (type, magic bytes, or size exceeded)' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('altText') altText?: string,
    @Body('isPrimary') isPrimary?: string | boolean,
  ) {
    const primaryBool =
      isPrimary === true || isPrimary === 'true'
        ? true
        : isPrimary === false || isPrimary === 'false'
        ? false
        : undefined;

    return this.productsService.uploadImage(id, file, altText, primaryBool);
  }

  @Get(':id/images')
  @Public()
  @ApiOperation({ summary: 'List images for a product (Public)' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'List of product images returned' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async getImages(@Param('id') id: string) {
    return this.productsService.getImages(id);
  }

  @Get(':id/images/:imageId')
  @Public()
  @ApiOperation({ summary: 'Get metadata for a specific product image (Public)' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiParam({ name: 'imageId', description: 'Image UUID' })
  @ApiResponse({ status: 200, description: 'Image metadata returned' })
  @ApiResponse({ status: 404, description: 'Product or image not found' })
  async getImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    return this.productsService.getImage(id, imageId);
  }

  @Get(':id/images/:imageId/file')
  @Public()
  @ApiOperation({ summary: 'Stream product image binary directly from Cloud Storage (Public)' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiParam({ name: 'imageId', description: 'Image UUID' })
  @ApiResponse({ status: 200, description: 'Image binary streamed' })
  @ApiResponse({ status: 404, description: 'Image or storage object not found' })
  async streamImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @Res() res: Response,
  ) {
    const { stream, contentType, contentLength } = await this.productsService.getImageStream(
      id,
      imageId,
    );

    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
    stream.pipe(res);
  }

  @Get(':id/images/:imageId/signed-url')
  @Public()
  @ApiOperation({ summary: 'Generate a short-lived signed URL for product image (Public)' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiParam({ name: 'imageId', description: 'Image UUID' })
  @ApiResponse({ status: 200, description: 'Signed URL generated' })
  @ApiResponse({ status: 404, description: 'Product or image not found' })
  async getSignedUrl(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @Query('expiresInMinutes') expiresInMinutes?: number,
  ) {
    return this.productsService.getImageSignedUrl(
      id,
      imageId,
      expiresInMinutes ? Number(expiresInMinutes) : 15,
    );
  }

  @Patch(':id/images/:imageId/primary')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('products:update')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Set an image as the primary image for a product (Admin & Inventory)' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiParam({ name: 'imageId', description: 'Image UUID' })
  @ApiResponse({ status: 200, description: 'Image set as primary' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Product or image not found' })
  async setPrimaryImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    return this.productsService.setPrimaryImage(id, imageId);
  }

  @Delete(':id/images/:imageId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('products:update')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete a product image from Cloud Storage and database (Admin & Inventory)' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiParam({ name: 'imageId', description: 'Image UUID' })
  @ApiResponse({ status: 200, description: 'Image deleted from storage and database' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Product or image not found' })
  async deleteImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    return this.productsService.deleteImage(id, imageId);
  }
}
