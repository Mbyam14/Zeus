# Zeus Developer Setup Guide

This guide will help new developers set up the Zeus project on their local machine.

## Prerequisites

- **Node.js** (v18 or higher)
- **Python** (v3.11 or higher)
- **Git**
- **Expo Go** app on your mobile device (for testing)

## Step 1: Clone the Repository

```bash
git clone https://github.com/Mbyam14/Zeus.git
cd Zeus
```

## Step 2: Get Your Local IP Address

You'll need your computer's local IP address for the mobile app to connect to your backend.

### Windows:
```bash
ipconfig
```
Look for "IPv4 Address" under your active network adapter (usually something like `192.168.x.x`)

### Mac/Linux:
```bash
ifconfig
```
Look for "inet" address (usually something like `192.168.x.x`)

**Write down this IP address - you'll need it in the next steps!**

## Step 3: Backend Setup

### 1. Navigate to backend folder:
```bash
cd zeus-backend
```

### 2. Create Python virtual environment:
```bash
python -m venv venv
```

### 3. Activate virtual environment:

**Windows:**
```bash
venv\Scripts\activate
```

**Mac/Linux:**
```bash
source venv/bin/activate
```

### 4. Install dependencies:
```bash
pip install -r requirements.txt
```

### 5. Set up environment variables:

Copy the example file:
```bash
cp .env.example .env
```

**IMPORTANT:** Ask the project lead for the actual credentials and add them to your `.env` file. You'll need:
- Supabase URL and Key
- JWT Secret
- OpenAI API Key
- AWS credentials

### 6. Update CORS settings:

In your `.env` file, add your local IP to `ALLOWED_ORIGINS`:
```env
ALLOWED_ORIGINS=http://localhost:19006,http://localhost:8081,http://YOUR_LOCAL_IP:8082,http://YOUR_LOCAL_IP:19006
```
Replace `YOUR_LOCAL_IP` with the IP address you found in Step 2.

Example:
```env
ALLOWED_ORIGINS=http://localhost:19006,http://localhost:8081,http://192.168.1.105:8082,http://192.168.1.105:19006
```

### 7. Start the backend server:
```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The backend should now be running on `http://0.0.0.0:8000`

## Step 4: Frontend Setup

### 1. Open a new terminal and navigate to the frontend folder:
```bash
cd zeus-app
```

### 2. Install dependencies:
```bash
npm install
```

### 3. Update API configuration:

Open `zeus-app/config.ts` and update the `API_BASE_URL` with your local IP:

```typescript
export const config = {
  API_BASE_URL: 'http://YOUR_LOCAL_IP:8000',  // Replace with your IP from Step 2
  API_TIMEOUT: 10000,
};
```

Example:
```typescript
export const config = {
  API_BASE_URL: 'http://192.168.1.105:8000',
  API_TIMEOUT: 10000,
};
```

### 4. Start the Expo development server:
```bash
npx expo start
```

If port 8081 is in use, you can specify a different port:
```bash
npx expo start --port 8082
```

## Step 5: Test on Your Mobile Device

1. Install **Expo Go** app on your phone (iOS App Store or Android Play Store)
2. Make sure your phone is on the **same WiFi network** as your computer
3. Open Expo Go app
4. Scan the QR code shown in your terminal

## Common Issues & Solutions

### Issue: "Cannot connect to backend" or "Network Error"

**Solution:**
1. Verify your phone and computer are on the same WiFi network
2. Check that your IP address in `config.ts` matches your current IP
3. Make sure backend is running (`http://YOUR_IP:8000` should show API docs)
4. Verify your IP is in backend's `ALLOWED_ORIGINS` in `.env`
5. Check Windows Firewall isn't blocking port 8000

### Issue: "Metro bundler port in use"

**Solution:**
```bash
npx expo start --port 8083
```

### Issue: Backend won't start

**Solution:**
1. Make sure virtual environment is activated
2. Check `.env` file has all required variables
3. Verify Python version is 3.11+

### Issue: Can't access Supabase database

**Solution:**
- Contact project lead for correct credentials
- Verify credentials are in your `.env` file
- Supabase is cloud-hosted, so it works from any IP

## Development Workflow

1. **Always pull latest changes before starting work:**
   ```bash
   git pull origin MainDev
   ```

2. **Create a new branch for your feature:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Start both backend and frontend:**
   - Terminal 1: Run backend (`uvicorn...`)
   - Terminal 2: Run frontend (`npx expo start`)

4. **Test on your device using Expo Go**

5. **Commit your changes:**
   ```bash
   git add .
   git commit -m "Description of your changes"
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request on GitHub**

## Project Structure

```
Zeus/
├── zeus-backend/          # Python FastAPI backend
│   ├── app/
│   │   ├── api/          # API routes
│   │   ├── models/       # Database models
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── services/     # Business logic
│   │   └── utils/        # Utility functions
│   ├── venv/             # Python virtual environment
│   └── .env              # Environment variables (NOT in git)
│
├── zeus-app/             # React Native (Expo) frontend
│   ├── src/
│   │   ├── components/   # Reusable components
│   │   ├── navigation/   # Navigation setup
│   │   ├── screens/      # Screen components
│   │   ├── services/     # API services
│   │   ├── store/        # State management (Zustand)
│   │   └── types/        # TypeScript types
│   └── config.ts         # App configuration (UPDATE YOUR IP HERE)
│
└── DEVELOPER_SETUP.md    # This file
```

## Need Help?

- Check existing Issues on GitHub
- Ask in the team chat
- Contact the project lead

## Important Notes

- **Never commit `.env` files** - they contain sensitive credentials
- **Always test on a real device** - Expo Go provides the best development experience
- **Update your IP in `config.ts`** if you switch WiFi networks
- **Keep dependencies up to date** - run `npm install` and `pip install -r requirements.txt` regularly
