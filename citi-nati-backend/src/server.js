require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const authRoutes = require('./routes/auth.routes');
const systemRoutes = require('./routes/system.routes');
const adminSetupRoutes = require('./routes/admin.setup');
const adminRoutes = require('./routes/admin.routes');
const adminBootstrapRoutes = require('./routes/admin.bootstrap');
const adminMessagesRoutes = require('./routes/admin-messages.routes');
const productsRoutes = require('./routes/products.routes');
const cartRoutes = require('./routes/cart.routes');
const orderRoutes = require('./routes/order.routes');
const paymentsRoutes = require('./routes/payments.routes');
const driversRoutes = require('./routes/drivers.routes');
const driversOrdersRoutes = require('./routes/drivers.orders.routes');
const salesRoutes = require('./routes/sales.routes');
const supportRoutes = require('./routes/support.routes');
const posCommandsRoutes = require('./routes/posCommands.routes');

const prisma = new PrismaClient();

async function start() {
  try {
    // Ensure upload directories exist
    const uploadDirs = [
      path.join(__dirname, '..', 'uploads'),
      path.join(__dirname, '..', 'uploads', 'products'),
      path.join(__dirname, '..', 'uploads', 'tickets')
    ];

    uploadDirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log('[STARTUP] Created upload directory:', dir);
      }
    });

    // Log DATABASE_URL for verification
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? `Connected to: ${process.env.DATABASE_URL.split('@')[1] || 'local'}` : 'NOT SET');
    
    // Connect to the database before starting the server
    await prisma.$connect();
    console.log('Connected to the database via Prisma');

    // Log current users on startup
    const usersOnStartup = await prisma.user.findMany({
      select: { id: true, email: true, role: true }
    });
    console.log('[DEBUG STARTUP] Users in database:', usersOnStartup);

    const app = express();
    const server = http.createServer(app);
    
    // CORS configuration for Socket.io
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      process.env.FRONTEND_URL || 'http://localhost:3000'
    ];
    
    const io = new Server(server, {
      cors: {
        origin: (origin, callback) => {
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        },
        methods: ['GET', 'POST'],
        credentials: true
      },
    });

    // Make io instance available globally
    global.io = io;

    // Socket.io connection handling
    io.on('connection', (socket) => {
      console.log('[Socket] New client connected:', socket.id);

      // Get user info from socket auth (passed during connection)
      const { userId, role } = socket.handshake.auth || {};

      // If auth has userId and role, use it immediately
      if (userId && role) {
        socket.userId = userId;
        socket.role = role;

        // Join role-based rooms
        if (role === 'admin') {
          socket.join('admin_room');
          console.log(`[Socket] ${socket.id} joined admin_room (from auth)`);
        } else if (role === 'driver') {
          socket.join(`driver_${userId}`);
          console.log(`[Socket] ${socket.id} joined driver_${userId} (from auth)`);
        } else if (role === 'user') {
          socket.join(`user_${userId}`);
          console.log(`[Socket] ${socket.id} joined user_${userId} (from auth)`);
        }
      }

      // Listen for identify event (for backward compatibility or real-time role assignment)
      socket.on('identify', async (data) => {
        const { userId, role, email } = data;
        console.log(`[Socket] ${socket.id} identify event received:`, { userId, role, email });
        
        if (userId && role) {
          socket.userId = userId;
          socket.role = role;
          
          try {
            // Join role-based rooms
            if (role === 'admin') {
              socket.join('admin_room');
              console.log(`[Socket] ${socket.id} joined admin_room (from identify)`);
            } else if (role === 'driver') {
              // For drivers, look up their driver ID by email
              let driverId = userId;
              
              if (email) {
                try {
                  const driver = await prisma.driver.findUnique({
                    where: { email: email },
                    select: { id: true }
                  });
                  if (driver) {
                    driverId = driver.id;
                    console.log(`[Socket] Found driver record for ${email}: ${driverId}`);
                  }
                } catch (err) {
                  console.log(`[Socket] Could not find driver by email: ${err.message}`);
                }
              }
              
              socket.driverId = driverId;
              socket.join(`driver_${driverId}`);
              console.log(`[Socket] ${socket.id} joined driver_${driverId} (from identify)`);
            } else if (role === 'user') {
              socket.join(`user_${userId}`);
              console.log(`[Socket] ${socket.id} joined user_${userId} (from identify)`);
            }
          } catch (err) {
            console.error(`[Socket] Error in identify event:`, err);
          }
        } else {
          console.log(`[Socket] Invalid identify data for ${socket.id}:`, { userId, role, email });
        }
      });

      // Receipt download via Socket.io
      socket.on('requestReceipt', async (orderId, callback) => {
        try {
          const userId = socket.userId;
          
          if (!userId) {
            console.warn(`[Socket] Receipt request from unauthenticated socket ${socket.id}`);
            return callback({ error: 'Not authenticated' });
          }

          if (!orderId) {
            return callback({ error: 'Order ID is required' });
          }

          // Find order
          const order = await prisma.order.findUnique({
            where: { id: parseInt(orderId) },
            include: {
              items: { include: { product: true } },
              user: { select: { id: true, name: true, email: true, phone: true } },
              driver: { select: { id: true, name: true, phone: true, vehicle: true } }
            }
          });

          if (!order) {
            return callback({ error: 'Order not found' });
          }

          // Verify ownership
          if (order.userId !== userId) {
            return callback({ error: 'Access denied' });
          }

          console.log(`[Socket] Generating receipt for order ${orderId}`);
          
          // Generate receipt PDF as base64
          const PDFDocument = require('pdfkit');
          const buffers = [];
          const doc = new PDFDocument({ margin: 40 });

          doc.on('data', chunk => buffers.push(chunk));
          doc.on('end', () => {
            const pdfBuffer = Buffer.concat(buffers);
            const base64Pdf = pdfBuffer.toString('base64');
            
            callback({
              success: true,
              pdf: base64Pdf,
              filename: `receipt-${order.id}.pdf`
            });
            
            console.log(`[Socket] Receipt sent for order ${orderId}`);
          });

          // Build PDF content
          doc.fontSize(20).font('Helvetica-Bold').text('CITI-NATI SUPERMARKET', { align: 'center' });
          doc.moveDown(0.3);
          doc.fontSize(10).font('Helvetica').text('Order Receipt', { align: 'center' });
          doc.moveDown(0.5);
          doc.strokeColor('#5B4B8A').lineWidth(1).moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
          doc.moveDown(0.5);

          // Order Info
          doc.fontSize(11).font('Helvetica-Bold').text('ORDER INFORMATION');
          doc.fontSize(10).font('Helvetica').fillColor('#333');
          doc.text(`Order ID: #${order.id}`);
          doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`);
          doc.text(`Status: ${order.status}`);
          doc.moveDown(0.5);

          // Customer Info
          doc.fontSize(11).font('Helvetica-Bold').text('CUSTOMER INFORMATION');
          doc.fontSize(10).font('Helvetica');
          doc.text(`Name: ${order.user.name}`);
          doc.text(`Email: ${order.user.email}`);
          doc.text(`Phone: ${order.user.phone || 'N/A'}`);
          doc.text(`Delivery Address: ${order.deliveryAddress || 'N/A'}`);
          doc.moveDown(0.5);

          // Items table
          doc.fontSize(11).font('Helvetica-Bold').text('ORDER ITEMS');
          doc.fontSize(10).font('Helvetica');
          
          const itemWidth = 250;
          const qtyWidth = 80;
          const priceWidth = 80;
          
          doc.text('Product', 40, doc.y, { width: itemWidth });
          doc.text('Qty', 40 + itemWidth, doc.y - 20, { width: qtyWidth });
          doc.text('Subtotal', 40 + itemWidth + qtyWidth, doc.y - 20, { width: priceWidth });
          doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
          doc.moveDown(0.3);

          order.items.forEach(item => {
            const subtotal = item.product.price * item.quantity;
            doc.text(item.product.name, 40, doc.y, { width: itemWidth });
            doc.text(String(item.quantity), 40 + itemWidth, doc.y - 20, { width: qtyWidth, align: 'center' });
            doc.text(`MWK ${subtotal.toLocaleString()}`, 40 + itemWidth + qtyWidth, doc.y - 20, { width: priceWidth, align: 'right' });
            doc.moveDown(0.4);
          });

          doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
          doc.moveDown(0.3);

          // Total
          doc.fontSize(12).font('Helvetica-Bold').text(`TOTAL: MWK ${order.total.toLocaleString()}`, { align: 'right' });
          doc.moveDown(1);
          
          doc.fontSize(9).font('Helvetica').fillColor('#999');
          doc.text('Thank you for your order!', { align: 'center' });
          doc.text('© 2026 Citi-Nati Supermarket', { align: 'center' });

          doc.end();
        } catch (err) {
          console.error('[Socket] Error generating receipt:', err);
          callback({ error: 'Failed to generate receipt' });
        }
      });

      socket.on('disconnect', () => {
        console.log(`[Socket] ${socket.id} disconnected`);
      });

      // =====================================================
      // TICKET ROOM HANDLERS (Real-time Support Chat)
      // =====================================================

      // Join a ticket room (both customer and admin)
      socket.on('joinTicketRoom', (ticketId) => {
        try {
          const roomName = `ticket_${ticketId}`;
          socket.join(roomName);
          console.log(`[Socket] ${socket.id} joined ${roomName}`);
          
          // Notify others in the room
          socket.to(roomName).emit('userJoined', {
            userId: socket.userId,
            role: socket.role
          });
        } catch (err) {
          console.error(`[Socket] Error joining ticket room:`, err);
        }
      });

      // Typing indicator in ticket room
      socket.on('ticketTyping', ({ ticketId, userId }) => {
        try {
          const roomName = `ticket_${ticketId}`;
          socket.to(roomName).emit('ticketTyping', { userId });
        } catch (err) {
          console.error(`[Socket] Error in ticketTyping:`, err);
        }
      });

      // Real-time ticket message
      socket.on('ticketMessage', async ({ ticketId, message, senderId, attachments }) => {
        try {
          // Save to database
          const reply = await prisma.ticketReply.create({
            data: {
              ticketId,
              message,
              senderId,
              attachments: attachments && attachments.length > 0 ? {
                create: attachments.map(att => ({
                  fileName: att.fileName || 'file',
                  fileUrl: att.fileUrl || '/uploads/default.pdf',
                  fileSize: att.fileSize || 0,
                  mimeType: att.mimeType || 'application/octet-stream'
                }))
              } : undefined
            },
            include: {
              attachments: true
            }
          });

          // Update ticket's updatedAt timestamp
          await prisma.supportTicket.update({
            where: { id: ticketId },
            data: { updatedAt: new Date() }
          });

          // Broadcast to all users in that ticket room
          global.io.to(`ticket_${ticketId}`).emit('ticketMessage', reply);
          console.log(`[Socket] New message in ticket_${ticketId}: ${message.substring(0, 50)}...`);
        } catch (err) {
          console.error(`[Socket] Error saving ticket message:`, err);
          socket.emit('ticketMessageError', { error: 'Failed to send message' });
        }
      });

      // Leave ticket room
      socket.on('leaveTicketRoom', (ticketId) => {
        try {
          const roomName = `ticket_${ticketId}`;
          socket.leave(roomName);
          console.log(`[Socket] ${socket.id} left ${roomName}`);
        } catch (err) {
          console.error(`[Socket] Error leaving ticket room:`, err);
        }
      });
    });

    // Middleware
    app.use(cookieParser());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ limit: '10mb', extended: true }));
    
    // CORS configuration for Express
    const corsOptions = {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          console.warn('[CORS] Rejected origin:', origin);
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization']
    };
    
    console.log('[CORS] Allowed origins:', allowedOrigins);
    app.use(cors(corsOptions));
    app.use('/uploads', express.static('uploads'));

    // Health route
    app.get('/api/health', (req, res) => {
      return res.json({ status: 'OK', bootstrap: 'enabled' });
    });

    // ⚠️  TEMPORARY SETUP ENDPOINT - DELETE AFTER FIRST LOGIN
    app.use('/api/setup', adminSetupRoutes);

    // Auth routes
    app.use('/api/auth', authRoutes);

    // Public system routes
    app.use('/api/system', systemRoutes);

    // Admin Bootstrap routes (one-time admin creation for free tier) - MUST come before protected admin routes
    app.use('/api/admin', adminBootstrapRoutes);

    // Admin routes (protected)
    app.use('/api/admin', adminRoutes);

    // Admin Messages routes
    app.use('/api/admin/messages', adminMessagesRoutes);

    // Products routes
    app.use('/api/products', productsRoutes);

    // Cart routes
    app.use('/api/cart', cartRoutes);

    // Order routes
    app.use('/api/orders', orderRoutes);

    // Payments routes
    app.use('/api/payments', paymentsRoutes);

    // Drivers orders routes (MUST be BEFORE /api/drivers to avoid catch-all)
    app.use('/api/drivers/orders', driversOrdersRoutes);

    // Drivers routes
    app.use('/api/drivers', driversRoutes);

    // Sales routes
    app.use('/api/sales', salesRoutes);

    // Support routes
    app.use('/api/support', supportRoutes);

    // POS command queue routes (polled by local POS Sync Agent)
    app.use('/api/pos-commands', posCommandsRoutes);

    // Ensure unknown API routes never return HTML to API clients
    app.use('/api/*', (req, res) => {
      const requestId = `api_404_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      console.warn('[API 404] Unknown API route hit', {
        requestId,
        method: req.method,
        path: req.originalUrl,
        origin: req.headers.origin || null,
        referer: req.headers.referer || null,
      });

      return res.status(404).json({
        error: 'API route not found',
        requestId,
      });
    });

    // API error handler: always return JSON for uncaught server errors on /api
    app.use((err, req, res, next) => {
      if (!req.originalUrl.startsWith('/api/')) {
        return next(err);
      }

      const requestId = `api_err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      console.error('[API ERROR] Unhandled API exception', {
        requestId,
        method: req.method,
        path: req.originalUrl,
        message: err.message,
        stack: err.stack,
      });

      if (res.headersSent) {
        return next(err);
      }

      return res.status(500).json({
        error: 'Internal server error',
        requestId,
      });
    });

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Unable to start server — failed to connect to DB');
    console.error(err);
    process.exit(1);
  }
}

start();
