import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            "AIzaSyBWpHk6QdAnMhzQrsKz1ham01YE9c1r-go",
  authDomain:        "ashish-tracker.vercel.app",
  projectId:         "stark-tracker",
  storageBucket:     "stark-tracker.firebasestorage.app",
  messagingSenderId: "282360696506",
  appId:             "1:282360696506:web:39b38d6a38dec4b214fc83",
};

export const isFirebaseConfigured = true;
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
