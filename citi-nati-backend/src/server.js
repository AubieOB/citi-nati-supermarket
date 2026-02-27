require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const authRoutes = require('./routes/auth.routes');
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

const prisma = new PrismaClient();

async function start() {
  try {
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
    app.use(express.json());
    
    // CORS configuration for Express
    const corsOptions = {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization']
    };
    
    app.use(cors(corsOptions));
    app.use('/uploads', express.static('uploads'));

    // Health route
    app.get('/api/health', (req, res) => {
      return res.json({ status: 'OK', bootstrap: 'enabled' });
    });

    // Auth routes
    app.use('/api/auth', authRoutes);

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
