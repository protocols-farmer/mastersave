# MasterSave Mobile App

A mobile app with **Spend**, **Save**, and **Grow** tabs.

---

## Prerequisites

Make sure you have the following installed on your machine:

- **Node.js** (LTS version recommended)
- **npm** (comes packaged with Node.js)
- **Expo Go** app installed on your physical mobile device (iOS/Android), or an active simulator

---

## Getting Started

1. **Clone the repository and navigate into the project folder:**

   ```bash
   git clone <your-repository-url>
   cd mastersave
   ```

2. **Install all project dependencies:**

   ```bash
   npm install
   ```

3. **Start the development server:**

   ```bash
   npm start
   ```

4. **Run the app:**

   - Scan the QR code using the Expo Go app (Android) or the Camera app (iOS).
   - Press `w` in your terminal to open the app directly in your web browser.
   - Press `i` to open an iOS simulator, or `a` for an Android emulator.

---

## Project Structure (`src/`)

```plaintext
src/
├── app/                      # Expo Router file-based screens and layouts
│   ├── _layout.tsx           # Root parent layout
│   ├── index.tsx             # Root entry point
│   ├── +not-found.tsx        # Fallback 404 route
│   ├── (auth)/               # Authentication route group
│   └── (tabs)/               # Main bottom-tab navigation group
│       ├── _layout.tsx       # Tabs layout wrapper
│       ├── index.tsx         # Spend Dashboard tab
│       ├── about/            # About screen (_About.tsx & index.tsx)
│       ├── grow/             # Grow screen (index.tsx)
│       ├── history/          # History screen (_History.tsx & index.tsx)
│       ├── profile/          # Profile screen (_Profile.tsx & index.tsx)
│       ├── save/             # Save screen (index.tsx)
│       ├── settings/         # Settings screen (_Settings.tsx & index.tsx)
│       └── use/              # Use screen (_layout.tsx & index.tsx)
├── components/               # Reusable UI layouts and components
│   ├── layouts/
│   │   ├── header/           # Global Header component (Header.tsx)
│   │   └── navigation/       # Bottombar.tsx, Sidebar.tsx, and links.ts
│   └── shared/
└── lib/                      # Mock data, hooks, types, and utility functions
```

---

## Tech Stack & Scripts

- **Framework:** React Native via Expo (`~57.0.26`)
- **Routing:** Expo Router (`~57.0.24`)
- **Icons:** `@expo/vector-icons` (Ionicons)

### Scripts

| Command           | Description                   |
| ----------------- | ----------------------------- |
| `npm start`       | Start Expo development server |
| `npm run web`     | Run in browser                |
| `npm run android` | Run on Android emulator       |
| `npm run ios`     | Run on iOS simulator          |
