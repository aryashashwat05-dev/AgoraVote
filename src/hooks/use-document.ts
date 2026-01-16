
'use client';
    
import { useState, useEffect } from 'react';
import {
  DocumentReference,
  onSnapshot,
  DocumentData,
  FirestoreError,
  DocumentSnapshot,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/** Utility type to add an 'id' field to a given type T. */
type WithId<T> = T & { id: string };

/**
 * Interface for the return value of the useDoc hook.
 * @template T Type of the document data.
 */
export interface UseDocResult<T> {
  data: WithId<T> | null; // Document data with ID, or null if it doesn't exist.
  isLoading: boolean;       // True while the document is being fetched for the first time.
  exists: boolean | undefined; // True if the document exists, false if not, undefined if loading.
  error: FirestoreError | Error | null; // Error object, or null.
}

/**
 * React hook to subscribe to a single Firestore document in real-time.
 * Handles nullable references.
 *
 * @template T Optional type for document data. Defaults to any.
 * @param {DocumentReference<DocumentData> | null | undefined} docRef -
 * The Firestore DocumentReference. Waits if null/undefined.
 * @returns {UseDocResult<T>} Object with data, isLoading, error, and exists status.
 */
export function useDocument<T = any>(
  docRef: DocumentReference<DocumentData> | null | undefined,
): UseDocResult<T> {
  type StateDataType = WithId<T> | null;

  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [exists, setExists] = useState<boolean | undefined>(undefined);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  useEffect(() => {
    // If the reference is not ready, reset to loading state.
    if (docRef === undefined) {
      setIsLoading(true);
      setData(null);
      setExists(undefined);
      setError(null);
      return;
    }
    
    // If the reference is explicitly null (e.g., user not logged in), it's not loading and doesn't exist.
    if (docRef === null) {
      setData(null);
      setIsLoading(false);
      setExists(false);
      setError(null);
      return;
    }

    // Starting a new fetch.
    setIsLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot: DocumentSnapshot<DocumentData>) => {
        if (snapshot.exists()) {
          setData({ ...(snapshot.data() as T), id: snapshot.id });
          setExists(true);
        } else {
          // Document does not exist.
          setData(null);
          setExists(false);
        }
        setError(null); // Clear any previous error on successful snapshot.
        setIsLoading(false); // Done loading.
      },
      (error: FirestoreError) => {
        const contextualError = new FirestorePermissionError({
          operation: 'get',
          path: docRef.path,
        });

        setError(contextualError);
        setData(null);
        setExists(false);
        setIsLoading(false);

        // trigger global error propagation
        errorEmitter.emit('permission-error', contextualError);
      }
    );

    return () => unsubscribe();
  }, [docRef]); // Re-run if the docRef changes.

  return { data, isLoading, exists, error };
}
