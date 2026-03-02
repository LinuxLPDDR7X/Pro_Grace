# Pro Grace: Firestore (Spark) Setup

## 1) Create Firebase project

1. Go to `https://console.firebase.google.com/`
2. Create/select project.
3. Add Web App.
4. Copy Web App config values.

## 2) Enable Firestore

1. In Firebase Console -> Firestore Database -> Create database.
2. Start in **production mode**.
3. Choose region closest to you (India/Asia nearest available).

## 3) Update `config.js`

Fill all Firebase values:

```js
window.PRO_GRACE_CONFIG = {
  firebaseApiKey: "YOUR_API_KEY",
  firebaseAuthDomain: "YOUR_PROJECT.firebaseapp.com",
  firebaseProjectId: "YOUR_PROJECT_ID",
  firebaseStorageBucket: "YOUR_PROJECT.appspot.com",
  firebaseMessagingSenderId: "YOUR_SENDER_ID",
  firebaseAppId: "YOUR_APP_ID",
  firestoreCollection: "prograce_state",
  firestoreDocId: "primary",
};
```

## 4) Firestore rules (single shared doc)

Use these rules for current no-login setup:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /prograce_state/{docId} {
      allow read, write: if true;
    }
  }
}
```

## 5) Deploy

1. Push code to GitHub.
2. Redeploy on Vercel.
3. Hard refresh once (`Ctrl+F5`) to activate latest service worker.

## 6) Verify

1. Open app console and check:
   - `[Pro Grace] Persistence mode: firestore`
2. Update chapter progress.
3. Open app on another device and confirm same data appears.

## Notes

- App still boots instantly from local backup, then syncs Firestore in background.
- Localhost uses `/api/data` fallback only if Firestore is unavailable.
