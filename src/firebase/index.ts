import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { useAuth, useFirestore, useUser, useMemoFirebase } from "./firestore/provider";
import { setDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from "./non-blocking-updates";
import { useCollection } from "./firestore/use-collection";
import { firebaseConfig } from "./config";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export function initializeFirebase() {
  return { firebaseApp: app, auth, firestore: db, storage };
}

export { app, auth, db, storage };
export { useAuth, useFirestore, useUser, useMemoFirebase, useCollection, setDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking };
export { FirebaseClientProvider } from "./client-provider";
export { FirebaseProvider } from "./firestore/provider";