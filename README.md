# CarpoolGo — DevSphere Inc.

**University of Johannesburg · Department of Applied Information Systems**  
**Sprint 2 Frontend Implementation**

---

# Tech Stack

| Layer | Technology |
| ------ | ---------- |
| Framework | React Native (Expo) |
| Navigation | React Navigation v6 |
| State Management | Zustand |
| Backend | Firebase (Authentication, Firestore, Storage) |
| Maps | react-native-maps + Google Maps API |
| Payments | Paystack / Flutterwave |
| Security | expo-secure-store, Firebase Security Rules |

---

# Project Structure

```text
CarpoolApp/
├── App.jsx
├── firebase.config.js
├── src/
│   ├── theme/
│   │   └── index.js
│   ├── navigation/
│   │   └── AppNavigator.jsx
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── SplashScreen.jsx
│   │   │   ├── WelcomeScreen.jsx
│   │   │   ├── GetStartedScreen.jsx
│   │   │   ├── RegisterScreen.jsx
│   │   │   └── LoginScreen.jsx
│   │   ├── passenger/
│   │   │   ├── HomeSearchScreen.jsx
│   │   │   ├── TripResultsScreen.jsx
│   │   │   ├── ConfirmBookingScreen.jsx
│   │   │   ├── MyTripsScreen.jsx
│   │   │   └── PassengerProfileScreen.jsx
│   │   ├── driver/
│   │   │   ├── DriverHomeScreen.jsx
│   │   │   ├── CreateTripScreen.jsx
│   │   │   ├── EarningsScreen.jsx
│   │   │   └── DriverProfileScreen.jsx
│   ├── components/
│   │   └── common/
│   │       ├── Button.jsx
│   │       └── Input.jsx
│   └── services/
│       ├── auth.service.js
│       └── payment.service.js
```

---

# Installation

## 1. Install Dependencies

```bash
cd CarpoolApp
npm install
```

## 2. Configure Firebase

1. Create a Firebase project.
2. Add Android and iOS apps.
3. Copy the Firebase configuration into `firebase.config.js`.
4. Enable:
   - Authentication (Email/Password and Google)
   - Firestore Database
   - Storage

---

## 3. Configure the app

The mobile app does not require a local `.env` file. App API calls, Clerk client
configuration, place autocomplete, map previews, and route lookup use the Render
service at `https://lyft-driver.onrender.com`.

Set the following values in the Render service's environment settings:

- `CLERK_PUBLISHABLE_KEY` — public Clerk publishable key returned to the app.
- `CLERK_SECRET_KEY` — Clerk server secret; never expose it to the mobile app.
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` — public client configuration
  returned by Render; privileged Supabase keys stay server-side.
- `GEOAPIFY_API_KEY` — used by Render for autocomplete and static map previews.
- `GOOGLE_MAPS_API_KEY` — optional server-side Directions API key; routing falls
  back to OSRM if it is not configured.
- Supabase, Stripe, Didit, and webhook credentials required by the API routes.

The native Google Maps SDK key is configured in `app.json` because iOS/Android
maps require a key in the native app. Restrict it to this app's bundle/package
identifiers and the Maps SDK APIs; do not use a server secret as a native key.

---

## 4. Run the App

```bash
npx expo start
```

Then scan the QR code using the Expo Go app.

---

## Deploy the API on Render

This repository contains Expo Router API routes in `app/(api)`. For a Render
Web Service, configure:

- **Root Directory:** leave blank (repository root)
- **Build Command:** `npm install && npm run build:render`
- **Start Command:** `npm run start:render`
- **Health Check Path:** `/health`

The driver app sends its API requests to `https://lyft-driver.onrender.com`;
this origin is configured in `lib/fetch.ts` and is not a `.env` variable.

The Render build exports only the production API routes. The start command runs
Expo's production server on Render's `PORT`; do not use `npm start`, which runs
the Expo development server and does not bind a production HTTP port.

Add the required credentials in Render's environment settings. Never set
server-side secrets as `EXPO_PUBLIC_*` or add them to Expo `extra`. In
particular, `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY`, Stripe secret keys,
and webhook secrets must remain server-side.

After deployment, confirm `https://<your-render-service>/health` returns
`{"status":"ok","service":"Lyft Driver API"}`.

---

# Application Flow

```text
Splash
   │
   ▼
Welcome (4 Onboarding Screens)
   │
   ▼
Get Started
   ├──────────────┐
   ▼              ▼
Passenger      Driver
Register       Register
   │              │
   ▼              ▼
Login          Login
   │              │
   ▼              ▼
Passenger Tabs   Driver Tabs
```

### Passenger Tabs

- Home Search
- Trip Results
- Confirm Booking
- My Trips
- Profile

### Driver Tabs

- Driver Home
- Create Trip
- Earnings
- Profile

---

# Security Features

- Firebase Authentication
- Passwords are never stored locally.
- Authentication tokens stored securely using `expo-secure-store`.
- Role-based navigation (Passenger, Driver, Admin).
- Form validation with user-friendly error messages.
- South African ID validation (13 digits).
- South African phone number validation (`+27` format).
- Minimum password length of 8 characters.
- Only the last four digits of an ID number are stored.
- Firebase Security Rules.
- OTP verification (planned).
- Biometric login (planned).

---

# Sprint 3 Roadmap

- [ ] Connect Firebase services to every screen.
- [ ] Google Maps trip search.
- [ ] Payment integration (Paystack/Flutterwave).
- [ ] Real-time trip tracking.
- [ ] Push notifications (Firebase Cloud Messaging).
- [ ] Admin dashboard.
- [ ] Safety monitoring.
- [ ] OTP verification.
- [ ] Biometric authentication.

---

# Team

| Member | Role | Responsibility |
| ------ | ---- | -------------- |
| S. Mdala | Project Manager | Project management and process flows |
| M. Sithomola | Backend Developer | Firebase services |
| N.S. Msomi | Frontend Developer | UI components and screens |
| L.P. Nama | Business Analyst | Requirements gathering |
| T. Macholo | UX/UI Designer | Figma design and navigation |
| G.P. Makwarela | Database Administrator | Firestore database design |

---

# License

University of Johannesburg – Department of Applied Information Systems

Sprint 2 Project – CarpoolGo (DevSphere Inc.)
