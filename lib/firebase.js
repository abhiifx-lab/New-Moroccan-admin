// lib/firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyB9565lPuWp7TSJX3MGIpu-UF3cx4lYNl0",
  authDomain: "moroccan-crm.firebaseapp.com",
  projectId: "moroccan-crm",
  storageBucket: "moroccan-crm.firebasestorage.app",
  messagingSenderId: "612271843746",
  appId: "1:612271843746:web:b8368767da9ebf3be6aafb",
  measurementId: "G-DPZL2V40SY"
};

// Initialize Firebase (SSR-safe check)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Analytics is only supported in browser environments
let analytics = null;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) analytics = getAnalytics(app);
  });
}

export { app, analytics };
