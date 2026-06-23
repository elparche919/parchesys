// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, doc, getDoc, setDoc, updateDoc, serverTimestamp, limit, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyC44rgiRq-cdDgcwy93GgzVXncWbugKCyY",
  authDomain: "parche-sys-v2.firebaseapp.com",
  projectId: "parche-sys-v2",
  storageBucket: "parche-sys-v2.firebasestorage.app",
  messagingSenderId: "367489065915",
  appId: "1:367489065915:web:300a2bca022c6eb6a41a9e"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

export { app, db, storage, auth, collection, addDoc, getDocs, query, where, orderBy, doc, getDoc, setDoc, updateDoc, serverTimestamp, limit, deleteDoc, ref, uploadString, getDownloadURL, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut };
