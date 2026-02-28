const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const addToCart = async (req, res) => {
  try {
    // Get authenticated user id
    const userId = req.user.userId;

    // Accept productId and quantity from request body
    const { productId, quantity } = req.body;

    // Convert to integers
    const productIdInt = parseInt(productId);
    const quantityInt = parseInt(quantity);

    // Validate quantity is greater than 0
    if (quantityInt <= 0) {
      return res.status(400).json({
        error: 'Quantity must be greater than 0',
      });
    }

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: productIdInt },
    });

    if (!product) {
      return res.status(404).json({
        error: 'Product not found',
      });
    }

    // Check if user already has a cart
    let cart = await prisma.cart.findUnique({
      where: { userId },
    });

    // If cart does not exist, create it
    if (!cart) {
      cart = await prisma.cart.create({
        data: {
          userId,
        },
      });
    }

    // Check if product already exists in cart
    const existingCartItem = await prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId: productIdInt,
      },
    });

    // If it exists, update quantity
    if (existingCartItem) {
      await prisma.cartItem.update({
        where: { id: existingCartItem.id },
        data: {
          quantity: existingCartItem.quantity + quantityInt,
        },
      });
    } else {
      // If it does not exist, create new cartItem
      // Calculate final price: use discountPrice if on sale, otherwise base price
      const finalPrice = product.isOnSale && product.discountPrice 
        ? product.discountPrice 
        : product.price;
      
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: productIdInt,
          quantity: quantityInt,
          price: finalPrice,
        },
      });
    }

    return res.status(200).json({
      message: 'Product added to cart successfully',
    });
  } catch (err) {
    console.error('Error adding product to cart:', err);
    return res.status(500).json({
      error: 'Server error while adding product to cart',
    });
  }
};

const getCart = async (req, res) => {
  try {
    // Get authenticated user id
    const userId = req.user.userId;

    // Find user cart with items and product relations
    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    // If cart does not exist, return empty cart structure
    if (!cart) {
      return res.status(200).json({
        cartId: null,
        items: [],
        total: 0,
      });
    }

    // Format cart items with clean structure
    const formattedItems = cart.items.map((item) => ({
      productId: item.productId,
      name: item.product.name,
      quantity: item.quantity,
      price: item.price,
      subtotal: item.quantity * item.price,
      imageUrl: item.product.image
        ? item.product.image.startsWith('http')
          ? item.product.image // Cloudinary URL
          : `${req.protocol}://${req.get('host')}/${item.product.image}`
        : null,
    }));

    // Calculate total by summing all subtotals
    const total = formattedItems.reduce((sum, item) => sum + item.subtotal, 0);

    return res.status(200).json({
      cartId: cart.id,
      items: formattedItems,
      total,
    });
  } catch (err) {
    console.error('Error fetching cart:', err);
    return res.status(500).json({
      error: 'Server error while fetching cart',
    });
  }
};

const updateCartItem = async (req, res) => {
  try {
    // Get authenticated user id
    const userId = req.user.userId;

    // Accept productId and quantity from request body
    const { productId, quantity } = req.body;

    // Convert to integers
    const productIdInt = parseInt(productId);
    const quantityInt = parseInt(quantity);

    // Validate quantity is not negative
    if (quantityInt < 0) {
      return res.status(400).json({
        error: 'Quantity cannot be negative',
      });
    }

    // Find user's cart
    const cart = await prisma.cart.findUnique({
      where: { userId },
    });

    if (!cart) {
      return res.status(404).json({
        error: 'Cart not found',
      });
    }

    // Find cartItem using cartId and productId
    const cartItem = await prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId: productIdInt,
      },
      include: {
        product: true,
      },
    });

    if (!cartItem) {
      return res.status(404).json({
        error: 'Item not found in cart',
      });
    }

    // If quantity is 0, delete the item
    if (quantityInt === 0) {
      await prisma.cartItem.delete({
        where: { id: cartItem.id },
      });

      return res.status(200).json({
        message: 'Item removed from cart',
      });
    }

    // If quantity > 0, update the item
    const updatedItem = await prisma.cartItem.update({
      where: { id: cartItem.id },
      data: {
        quantity: quantityInt,
      },
      include: {
        product: true,
      },
    });

    // Format response
    const formattedItem = {
      productId: updatedItem.productId,
      name: updatedItem.product.name,
      quantity: updatedItem.quantity,
      price: updatedItem.price,
      subtotal: updatedItem.quantity * updatedItem.price,
      imageUrl: updatedItem.product.image
        ? updatedItem.product.image.startsWith('http')
          ? updatedItem.product.image // Cloudinary URL
          : `${req.protocol}://${req.get('host')}/${updatedItem.product.image}`
        : null,
    };

    return res.status(200).json({
      message: 'Item updated successfully',
      item: formattedItem,
    });
  } catch (err) {
    console.error('Error updating cart item:', err);
    return res.status(500).json({
      error: 'Server error while updating cart item',
    });
  }
};

module.exports = { addToCart, getCart, updateCartItem };
