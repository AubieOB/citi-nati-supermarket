# Cloudinary Integration - Setup Instructions

## Overview
This project now uses Cloudinary for persistent image storage instead of local filesystem. This ensures product images are preserved across server restarts, especially important for Render's ephemeral filesystem.

## Setup Steps

### 1. Create Cloudinary Account
- Go to [https://cloudinary.com/](https://cloudinary.com/)
- Sign up for a free account
- Log in to your dashboard

### 2. Get API Credentials
From your Cloudinary dashboard:
- Copy your **Cloud Name**
- Copy your **API Key**
- Generate and copy your **API Secret**

### 3. Add Environment Variables
In your `.env` file (backend), add:

```
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

On Render deployment platform:
1. Go to your service settings
2. Add these three environment variables with your credentials
3. Redeploy the service

### 4. Testing
- Upload a product with an image via admin panel
- Images should now appear in your Cloudinary dashboard under `citi-nati-products` folder
- Restart the server - images will persist!

## Features
✅ Automatic image optimization by Cloudinary
✅ CDN delivery worldwide
✅ Persistent storage across restarts
✅ Automatic URL generation
✅ Free tier includes 25 credits/month (~100 image uploads)

## Image Folder Structure
All product images are stored in the `citi-nati-products` folder in Cloudinary.

## Fallback Support
The code supports both Cloudinary URLs (https://res.cloudinary.com/) and legacy local paths in case of migration. Images are detected by checking if URL starts with `http`.

## Notes
- Free tier includes generous quotas for most use cases
- Images are optimized automatically for performance
- No need to manually delete images - they're managed through the application
