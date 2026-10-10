import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  RawBodyRequest,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  private extractUser(req: any): { id: string; role?: string } {
    if (!req.user?.id) throw new UnauthorizedException('Authentication required');
    return { id: req.user.id, role: req.user.role };
  }

  @Post('initiate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate payment session for an order' })
  @ApiResponse({ status: 200, description: 'Payment session created or returned' })
  @ApiResponse({ status: 400, description: 'Invalid order amount or provider' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 409, description: 'Order already paid or cancelled' })
  async initiatePayment(@Req() req: any, @Body() dto: InitiatePaymentDto) {
    const user = this.extractUser(req);
    return this.paymentsService.initiatePayment(user.id, dto, user);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get payment details by payment ID' })
  @ApiResponse({ status: 200, description: 'Payment record returned' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async getPayment(@Req() req: any, @Param('id') id: string) {
    const user = this.extractUser(req);
    return this.paymentsService.getPaymentById(id, user);
  }

  @Get('order/:orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get payment history for an order' })
  @ApiResponse({ status: 200, description: 'List of payment records returned' })
  async getPaymentsByOrder(@Req() req: any, @Param('orderId') orderId: string) {
    const user = this.extractUser(req);
    return this.paymentsService.getPaymentsByOrder(orderId, user);
  }

  @Post(':id/refund')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refund a completed payment' })
  @ApiResponse({ status: 200, description: 'Refund initiated and completed' })
  @ApiResponse({ status: 403, description: 'Forbidden for non-admin' })
  @ApiResponse({ status: 409, description: 'Payment not in SUCCESS state' })
  async refundPayment(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: RefundPaymentDto,
  ) {
    const user = this.extractUser(req);
    return this.paymentsService.refundPayment(id, dto, user);
  }

  @Post('webhook/:provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inbound cryptographic webhook receiver for payment providers' })
  @ApiParam({ name: 'provider', description: 'Provider identifier (e.g. TEST_SANDBOX, RAZORPAY, STRIPE)' })
  @ApiResponse({ status: 200, description: 'Webhook acknowledged and processed' })
  @ApiResponse({ status: 401, description: 'Invalid cryptographic signature' })
  async handleWebhook(
    @Param('provider') provider: string,
    @Headers() headers: Record<string, string>,
    @Req() req: RawBodyRequest<Request>,
  ) {
    // Determine raw body: prefer req.rawBody buffer, fallback to stringified body
    const rawBody =
      req.rawBody !== undefined
        ? req.rawBody
        : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body);
    return this.paymentsService.handleWebhook(provider, headers, rawBody);
  }
}
