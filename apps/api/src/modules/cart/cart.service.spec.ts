import { CartService } from './cart.service';

describe('CartService Financial Calculations', () => {
  let service: CartService;

  beforeEach(() => {
    service = new CartService();
  });

  it('should accurately calculate subtotal, discount, GST, and shipping', () => {
    // Mock cart items: Product with ₹50,000 price (5000000 paise) and 10% discount
    const mockItems = [
      {
        id: 'item-1',
        quantity: 1,
        product: {
          id: 'prod-1',
          name: 'Samsung Galaxy Phone',
          sku: 'SAM-PHONE',
          description: 'Flagship phone',
          price: 5000000, // ₹50,000.00 in paise
          discountPercentage: 10, // 10% discount = ₹5,000.00
          stock: 20,
          categoryId: 'cat-1',
          isActive: true,
          attributes: {},
          images: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    ];

    const summary = (service as any).calculateCartSummary(mockItems);

    // Subtotal = 50,000.00 (5,000,000 paise)
    expect(summary.subtotal).toBe(5000000);
    // Discount = 5,000.00 (500,000 paise)
    expect(summary.discountTotal).toBe(500000);

    // Discounted Subtotal = 45,000.00 (4,500,000 paise)
    // GST 18% on discounted subtotal = 45,000 * 0.18 = 8,100.00 (810,000 paise)
    expect(summary.taxTotal).toBe(810000);

    // Discounted subtotal (45,000) <= 50,000 threshold, so standard shipping ₹499 applies (49,900 paise)
    expect(summary.shippingFee).toBe(49900);

    // Total = 45,000 + 8,100 + 499 = 53,599.00 (5,359,900 paise)
    expect(summary.grandTotal).toBe(5359900);
  });

  it('should provide free shipping if discounted subtotal exceeds ₹50,000 threshold', () => {
    const mockItems = [
      {
        id: 'item-2',
        quantity: 1,
        product: {
          id: 'prod-2',
          name: 'MacBook Pro M4',
          sku: 'APL-MBP',
          description: 'High-end laptop',
          price: 20000000, // ₹2,00,000.00 in paise
          discountPercentage: 0,
          stock: 10,
          categoryId: 'cat-2',
          isActive: true,
          attributes: {},
          images: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    ];

    const summary = (service as any).calculateCartSummary(mockItems);
    expect(summary.shippingFee).toBe(0); // Free shipping qualified
  });
});
