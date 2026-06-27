/* ============================================================
   Varchaz — Product Service
   ============================================================ */

import {
  collection, doc, getDocs, getDoc, setDoc, updateDoc, query, where, orderBy, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Product, SupervisorProducts } from '../types';

const PRODUCTS_COL = 'products';
const SUPERVISOR_PRODUCTS_COL = 'supervisorProducts';

/** Fetch all global products */
export async function fetchAllProducts(): Promise<Product[]> {
  const snap = await getDocs(collection(db, PRODUCTS_COL));
  const prods = snap.docs.map(d => ({ productId: d.id, ...d.data() } as Product));
  return prods.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/** Fetch active global products */
export async function fetchActiveProducts(): Promise<Product[]> {
  const all = await fetchAllProducts();
  return all.filter(p => p.isActive);
}

/** Create a new product (admin only) */
export async function createProduct(name: string, description: string, createdBy: string): Promise<string> {
  const docRef = doc(collection(db, PRODUCTS_COL));
  const product: Omit<Product, 'productId'> = {
    name,
    description,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy,
    addedDate: serverTimestamp()
  };
  await setDoc(docRef, product);
  return docRef.id;
}

/** Update a product */
export async function updateProduct(productId: string, updates: Partial<Product>): Promise<void> {
  await updateDoc(doc(db, PRODUCTS_COL, productId), {
    ...updates,
    updatedAt: serverTimestamp()
  });
}

/** Fetch supervisor's active product IDs */
export async function fetchSupervisorProducts(supervisorId: string): Promise<string[]> {
  const docSnap = await getDoc(doc(db, SUPERVISOR_PRODUCTS_COL, supervisorId));
  if (docSnap.exists()) {
    return (docSnap.data() as SupervisorProducts).activeProductIds;
  }
  return [];
}

/** Set supervisor's active product IDs */
export async function setSupervisorProducts(supervisorId: string, activeProductIds: string[]): Promise<void> {
  await setDoc(doc(db, SUPERVISOR_PRODUCTS_COL, supervisorId), {
    supervisorId,
    activeProductIds,
    updatedAt: serverTimestamp()
  });
}

/** Get active products for a user based on their supervisor's selection */
export async function getActiveProductsForUser(supervisorId: string): Promise<Product[]> {
  const activeIds = await fetchSupervisorProducts(supervisorId);
  if (activeIds.length === 0) {
    // If supervisor hasn't selected any, return all active global products
    return fetchActiveProducts();
  }
  const allProducts = await fetchActiveProducts();
  return allProducts.filter(p => activeIds.includes(p.productId));
}
