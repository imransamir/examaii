# ExamAI — Setup Guide

## First Time Setup (do this once)

### Step 1 — Open PowerShell in this folder
Right-click inside this folder → "Open in Terminal"

### Step 2 — Install everything
```
npm install
```

### Step 3 — Set up your keys
Copy the .env.example file, rename it to .env, then open it in Notepad and fill in:
- Your OpenAI API key (from platform.openai.com/api-keys)
- Your Firebase keys (from Firebase Console → Project Settings)

### Step 4 — Run the app
```
npm run dev
```
Open http://localhost:5173 in your browser.

---

## Every time after that
Just open PowerShell in this folder and run:
```
npm run dev
```

---

## Firebase Setup (if not done yet)
1. Go to console.firebase.google.com
2. Select your ExamAI project
3. Go to Authentication → Sign-in method → Enable Email/Password
4. Go to Project Settings → Your apps → copy the config values into .env
