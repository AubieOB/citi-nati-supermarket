export const FAQ_KNOWLEDGE_BASE = [
  {
    category: 'Orders & Cart',
    questions: [
      {
        id: 'orders-cart-minimum-order',
        question: 'Is there a minimum order value?',
        answer:
          'Yes. The default minimum order value is MWK 10,000, measured against your cart items subtotal. This value is store-configurable and may be adjusted based on operations, so the latest amount shown in your cart is the one currently in effect.',
      },
      {
        id: 'orders-cart-cannot-continue',
        question: 'Why can\'t I continue from my cart?',
        answer:
          'You can only continue when your cart is not empty and your cart items subtotal meets the current minimum order value. If your subtotal is below the minimum, the cart shows how much more to add before checkout becomes available.',
      },
      {
        id: 'orders-cart-total',
        question: 'How does my cart total work?',
        answer:
          'Your cart shows product subtotal and VAT details based on current cart items. Delivery fee is not added at cart stage. The final payable amount is calculated during checkout after delivery area validation.',
      },
      {
        id: 'orders-cart-update-quantity',
        question: 'How do I update item quantities in my cart?',
        answer:
          'Use the quantity field next to each item. The cart updates using server-side validation, so totals and item subtotals refresh to match current valid cart state.',
      },
      {
        id: 'orders-cart-remove-item',
        question: 'How do I remove an item from my cart?',
        answer:
          'Use the Remove action for that item, or set quantity to 0. The item is removed from your cart and the totals are recalculated.',
      },
      {
        id: 'orders-cart-stock-availability',
        question: 'Can I still see stock issues after adding items to cart?',
        answer:
          'Yes. Stock is validated again before order placement. If stock changed since adding to cart, checkout can fail until you adjust quantities or remove unavailable items.',
      },
    ],
  },
  {
    category: 'Checkout & Delivery',
    questions: [
      {
        id: 'checkout-delivery-supported-areas',
        question: 'Which delivery areas are supported?',
        answer:
          'Delivery is limited to active configured delivery zones. At checkout, you select district and area from supported options. If a zone is inactive or not configured, delivery is not available for that area.',
      },
      {
        id: 'checkout-delivery-area-selection',
        question: 'How does delivery area selection work?',
        answer:
          'You choose district and area at checkout from available delivery zone options. The system validates your selection against active zone records before creating the order.',
      },
      {
        id: 'checkout-delivery-gps-usage',
        question: 'Why does checkout ask for my location?',
        answer:
          'Checkout uses latitude and longitude to validate delivery coverage. For zones configured with radius rules, your location must fall within the allowed radius to proceed.',
      },
      {
        id: 'checkout-cannot-complete',
        question: 'Why can\'t I complete my checkout?',
        answer:
          'Checkout can fail if required delivery details are missing, the selected area is unsupported, your location is outside zone coverage radius, stock validation fails, or payment initialization cannot be completed.',
      },
      {
        id: 'checkout-outside-coverage',
        question: 'What happens if I am outside delivery coverage?',
        answer:
          'The system blocks checkout and returns a delivery coverage error. You will need to choose a supported area/location before continuing.',
      },
      {
        id: 'checkout-delivery-limitations',
        question: 'Why is delivery unavailable in some places?',
        answer:
          'Delivery depends on configured service zones and active operational coverage. Not every district-area combination is always enabled.',
      },
    ],
  },
  {
    category: 'Payments & Pricing',
    questions: [
      {
        id: 'payments-pricing-total-calculation',
        question: 'How is my final amount calculated?',
        answer:
          'Final payable amount is calculated as: cart items subtotal + validated delivery fee. The server stores subtotal, delivery fee, and final total separately for accuracy.',
      },
      {
        id: 'payments-pricing-delivery-fee',
        question: 'Why do I see a delivery fee?',
        answer:
          'Delivery fee comes from the delivery zone matched during checkout validation. It is added after subtotal checks and included in the final payable total.',
      },
      {
        id: 'payments-pricing-fee-by-location',
        question: 'Does delivery fee change by location?',
        answer:
          'Yes. Delivery fee can vary by district/area zone configuration, so different supported areas may have different fees.',
      },
      {
        id: 'payments-methods',
        question: 'Which payment methods can I use?',
        answer:
          'Payments are processed through Paychangu checkout. Available payment options are shown on the Paychangu payment page for your transaction.',
      },
      {
        id: 'payments-order-confirmation',
        question: 'When is my order confirmed?',
        answer:
          'Order is created first with pending payment status. It is confirmed for fulfillment after successful payment verification, then order/payment confirmation notifications are sent.',
      },
      {
        id: 'payments-failed-or-interrupted',
        question: 'What if my payment is interrupted or not completed?',
        answer:
          'If payment is not verified, the order remains in pending-payment state and is not processed for fulfillment. You can retry payment flow from your order context when available.',
      },
    ],
  },
  {
    category: 'Account & Security',
    questions: [
      {
        id: 'account-login-failed',
        question: 'Why can\'t I log in?',
        answer:
          'Common reasons are incorrect email/password, inactive account, or temporary lockout after repeated failed attempts. Use the exact registered email and reset your password if needed.',
      },
      {
        id: 'account-temporary-lockout',
        question: 'What is temporary login lockout?',
        answer:
          'For account protection, repeated failed logins trigger a temporary lockout. By default this occurs after 5 failed attempts and lasts about 5 minutes, though settings can be adjusted by the system administrator.',
      },
      {
        id: 'account-password-reset',
        question: 'How does password reset work?',
        answer:
          'Use Forgot Password to request a reset code sent to your email. The reset code expires in 15 minutes. Request a new code if it expires.',
      },
      {
        id: 'account-email-verification',
        question: 'Do I need email verification for account setup?',
        answer:
          'Yes. Registration sends a verification code to your email. The code expires in 10 minutes, and you can request a new code if needed.',
      },
      {
        id: 'account-security-best-practices',
        question: 'How can I keep my account safe?',
        answer:
          'Use a strong unique password, do not share login details or one-time codes, and only reset password through official app screens.',
      },
      {
        id: 'account-session-expired',
        question: 'Why was I asked to sign in again?',
        answer:
          'If your session expires or becomes invalid, protected actions like cart, checkout, and account updates require you to sign in again for security.',
      },
    ],
  },
  {
    category: 'General Information',
    questions: [
      {
        id: 'general-service-coverage',
        question: 'Where does the service operate?',
        answer:
          'Service operates in configured Malawi delivery zones available in the system. Coverage is determined by active district-area delivery configuration.',
      },
      {
        id: 'general-delivery-expectations',
        question: 'How should I expect delivery updates?',
        answer:
          'After successful payment, order status progresses through fulfillment stages. You can check updates in your account order history, and email notifications are sent for key events.',
      },
      {
        id: 'general-order-changes',
        question: 'Can I change items after checkout starts?',
        answer:
          'Item and subtotal changes should be done in cart before order creation. Once order creation and payment flow begin, changes are limited by current order/payment status.',
      },
      {
        id: 'general-why-behavior-differs',
        question: 'Why can behavior differ between areas or times?',
        answer:
          'Some settings such as active delivery zones, delivery fees, and minimum order value are operational configurations and can be updated by the store.',
      },
      {
        id: 'general-support',
        question: 'I still need help. What should I do?',
        answer:
          'If the FAQ does not solve your issue, contact support through the Help Center or Contact page and include your order number (if available) for faster assistance.',
      },
    ],
  },
];

export const FAQ_TOTAL_QUESTIONS = FAQ_KNOWLEDGE_BASE.reduce(
  (sum, section) => sum + section.questions.length,
  0
);
