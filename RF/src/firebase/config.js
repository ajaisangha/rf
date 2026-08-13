import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyDoD14NmzslOuRf_r49q3GJYE7OzUVQ28c',
  authDomain: 'rf-tracker-47810.firebaseapp.com',
  projectId: 'rf-tracker-47810',
  storageBucket: 'rf-tracker-47810.firebasestorage.app',
  messagingSenderId: '74489661867',
  appId: '1:74489661867:web:b02fa429be5cf72100eaee',
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)