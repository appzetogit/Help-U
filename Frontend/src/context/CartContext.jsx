import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { cartService } from '../services/cartService';

/**
 * Cart Context
 * Provides global cart state management with event-driven updates
 * No polling - cart count updates instantly on add/remove actions
 */

const CartContext = createContext(null);

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState([]);
  const [cartCount, setCartCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Fetch cart from server (only on initial load)
  const fetchCart = useCallback(async () => {
    try {
      // Prevention: Do not fetch user cart if we are in worker/admin apps
      const path = window.location.pathname;
      if (path.startsWith('/worker') || path.startsWith('/admin')) {
        return;
      }

      const token = localStorage.getItem('accessToken');
      if (!token) {
        setCartItems([]);
        setCartCount(0);
        setIsInitialized(true);
        return;
      }

      setIsLoading(true);
      const response = await cartService.getCart();
      if (response.success) {
        const items = response.data || [];
        setCartItems(items);
        setCartCount(items.length);
      }
    } catch (error) {
      // Silently handle auth errors
      if (error.response?.status === 401 || error.response?.status === 403) {
        setCartItems([]);
        setCartCount(0);
      }
    } finally {
      setIsLoading(false);
      setIsInitialized(true);
    }
  }, []);

  // Initialize cart on mount
  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  // Add item to cart - instant update + server sync
  const addToCart = useCallback(async (itemData) => {
    // Optimistic Update
    const tempId = `temp-${Date.now()}`;
    const tempItem = { ...itemData, _id: tempId, id: tempId };

    setCartItems(prev => [...prev, tempItem]);
    setCartCount(prev => prev + 1);

    try {
      const response = await cartService.addToCart(itemData);

      if (response.success && response.data) {
        // Replace temp item with real item from server, but preserve local fields (like category) just in case
        setCartItems(prev => prev.map(item =>
          item._id === tempId ? { ...item, ...response.data } : item
        ));
      } else {
        // Revert on failure (if success false but no throw)
        setCartItems(prev => prev.filter(item => item._id !== tempId));
        setCartCount(prev => Math.max(0, prev - 1));
      }
      return response;
    } catch (error) {
      // Revert on error
      setCartItems(prev => prev.filter(item => item._id !== tempId));
      setCartCount(prev => Math.max(0, prev - 1));
      throw error;
    }
  }, []);

  // Update item quantity
  const updateItem = useCallback(async (itemId, serviceCount) => {
    // Optimistic update
    setCartItems(prev =>
      prev.map(item => {
        if (item._id === itemId || item.id === itemId) {
          const unitPrice = item.unitPrice || (item.serviceCount ? item.price / item.serviceCount : item.price);
          return {
            ...item,
            serviceCount,
            price: unitPrice * serviceCount
          };
        }
        return item;
      })
    );

    try {
      const response = await cartService.updateItem(itemId, serviceCount);
      if (response.success && response.data) {
        // Replace with server data to ensure correctness
        setCartItems(prev =>
          prev.map(item => item._id === itemId ? response.data : item)
        );
      } else {
        fetchCart();
      }
      return response;
    } catch (error) {
      fetchCart();
      throw error;
    }
  }, [fetchCart]);

  // Remove item from cart - instant update
  const removeItem = useCallback(async (itemId) => {
    // Optimistic update
    setCartItems(prev => prev.filter(item => item._id !== itemId && item.id !== itemId));
    setCartCount(prev => Math.max(0, prev - 1));

    try {
      const response = await cartService.removeItem(itemId);
      if (!response.success) {
        // Re-fetch on failure to ensure correct state
        fetchCart();
      }
      return response;
    } catch (error) {
      fetchCart();
      throw error;
    }
  }, [fetchCart]);

  // Remove all items from a category
  const removeCategoryItems = useCallback(async (category) => {
    // Optimistic update
    setCartItems(prev => {
      const filtered = prev.filter(item => item.category !== category);
      setCartCount(filtered.length);
      return filtered;
    });

    try {
      const response = await cartService.removeCategoryItems(category);
      if (!response.success) {
        fetchCart();
      }
      return response;
    } catch (error) {
      fetchCart();
      throw error;
    }
  }, [fetchCart]);

  // Clear entire cart
  const clearCart = useCallback(async () => {
    try {
      const response = await cartService.clearCart();
      if (response.success) {
        setCartItems([]);
        setCartCount(0);
      }
      return response;
    } catch (error) {
      throw error;
    }
  }, []);

  // Reset cart (for logout)
  const resetCart = useCallback(() => {
    setCartItems([]);
    setCartCount(0);
    setIsInitialized(false);
  }, []);

  const value = {
    cartItems,
    cartCount,
    isLoading,
    isInitialized,
    fetchCart,
    addToCart,
    updateItem,
    removeItem,
    removeCategoryItems,
    clearCart,
    resetCart,
  };

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
};

// Custom hook to use cart context
export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export default CartContext;
