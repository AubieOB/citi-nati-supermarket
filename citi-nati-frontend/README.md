# Citi-Nati Frontend

A modern, production-ready e-commerce frontend for the Citi-Nati Supermarket.

## 🚀 Features

- **Responsive Design** - Works perfectly on desktop, tablet, and mobile
- **Clean UI** - Modern, professional styling with CSS
- **Navigation System** - Easy-to-use header with mobile hamburger menu
- **Routing** - Full page routing with React Router
- **Public Pages** - Home, Products, Cart, Checkout, Login, Register
- **Protected Routes** - Admin and Driver dashboards with authentication
- **Layout System** - Consistent header and footer across all pages
- **Mobile Optimized** - Touch-friendly interface and responsive layouts

## 📁 Project Structure

```
src/
├── components/
│   ├── layout/           # Layout components (Header, Footer, Layout)
│   └── ui/              # Reusable UI components (Button, Container)
├── pages/
│   ├── public/          # Public pages (Home, Products, Cart, etc.)
│   ├── admin/           # Admin-only pages (AdminDashboard)
│   ├── driver/          # Driver-only pages (DriverDashboard)
│   └── NotFound.js      # 404 page
├── styles/
│   └── global.css       # Global styles and resets
├── App.js               # Main app with routing
└── index.js             # Entry point

public/
└── index.html           # HTML template
```

## 🛠️ Tech Stack

- **React 18** - UI library
- **React Router v6** - Client-side routing
- **Vite** - Fast build tool
- **CSS3** - Modern styling with flexbox and grid
- **Axios** - HTTP client for API calls

## 📋 Available Routes

### Public Routes
- `/` - Home page
- `/products` - Browse all products
- `/cart` - Shopping cart
- `/checkout` - Checkout page
- `/login` - Login page
- `/register` - Registration page

### Protected Routes
- `/admin` - Admin dashboard (requires authentication)
- `/driver` - Driver dashboard (requires authentication)

### Error Routes
- `*` - 404 Not Found page

## ⚙️ Installation

### Prerequisites
- Node.js 16+ and npm 8+
- Backend server running on `http://localhost:5000`

### Setup Steps

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env.local
   ```

3. **Configure API endpoint** (if needed)
   ```bash
   # Edit .env.local with your backend API URL
   VITE_API_BASE_URL=http://localhost:5000/api
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```
   The app opens at `http://localhost:3000`

## 🏗️ Building for Production

```bash
npm run build
```

Output files are in the `dist/` folder.

## 📦 Components

### Layout Components
- **Header** - Navigation bar with responsive mobile menu
- **Footer** - Site footer with links and copyright
- **Layout** - Wrapper component that includes Header and Footer

### UI Components
- **Button** - Reusable button with variants (primary, secondary, outline)
- **Container** - Max-width container with consistent padding

## 🎨 Styling

All styles are in `src/styles/global.css` with:
- CSS Reset and base styles
- Layout utilities
- Component-specific styles
- Responsive design with media queries
- Mobile-first approach

## 🔐 Authentication

Currently uses localStorage for mock authentication. When integrated with backend:
- Login stores JWT token in localStorage
- Protected routes check for token before access
- Unauthorized users get redirected to login

## 🚀 Next Steps

- [ ] Connect API endpoints for products, cart, and orders
- [ ] Implement user authentication with actual backend
- [ ] Add product detail pages
- [ ] Implement shopping cart functionality
- [ ] Add checkout payment processing
- [ ] Create admin management pages
- [ ] Create driver delivery tracking

## 📝 Notes

- No external CSS frameworks (Bootstrap, Tailwind) - pure CSS3
- Mobile-responsive hamburger menu with smooth transitions
- All pages properly organized in public/admin/driver folders
- Ready for API integration

## 🤝 Contributing

Regular updates maintain production standards and best practices.

---

**Version:** 1.0.0  
**Last Updated:** February 2026
