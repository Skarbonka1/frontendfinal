// Plik: src/notification-manager.js

import { getToken } from "firebase/messaging";
import { messaging } from "./firebase-config";

const API_URL = 'https://serwerfinal.onrender.com/api';

export const requestNotificationPermission = async () => {
  try {
    const vapidKey = "BFr6_F0fqESHkNxesjiEJiiDt5nIkhRKkIiwsfSFuz9_wI58nhqmEhM8_8stPu-lqpW3oCr547gVaWnnnBMCoBg"; 

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      console.log("Zgoda na powiadomienia udzielona. Pobieranie tokenu...");
      const currentToken = await getToken(messaging, { vapidKey: vapidKey });
      
      if (currentToken) {
        console.log("✅ Token FCM uzyskany:", currentToken);
        // KLUCZOWA ZMIANA: Zwracamy token, aby AppContext mógł go użyć
        return currentToken;
      } else {
        console.log("❌ Nie udało się uzyskać tokenu.");
        return null;
      }
    } else {
      console.log("Użytkownik nie wyraził zgody na powiadomienia.");
      return null;
    }
  } catch (error) {
    console.error("❌ Błąd podczas pobierania tokenu:", error);
    return null;
  }
};

// NOWA FUNKCJA: Rejestracja tokenu FCM na serwerze
export const registerToken = async (userId, fcmToken) => {
  try {
    const response = await fetch(`${API_URL}/register-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId,
        token: fcmToken
      })
    });
    
    if (response.ok) {
      console.log('✅ Token FCM zarejestrowany na serwerze');
      return true;
    } else {
      console.error('❌ Błąd rejestracji tokenu na serwerze');
      return false;
    }
  } catch (error) {
    console.error('❌ Błąd podczas rejestracji tokenu:', error);
    return false;
  }
};

// NOWA FUNKCJA: Usuwanie tokenu FCM z serwera (przy wylogowaniu)
export const unregisterToken = async (userId, fcmToken) => {
  try {
    const response = await fetch(`${API_URL}/unregister-token`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId,
        token: fcmToken
      })
    });
    
    if (response.ok) {
      console.log('✅ Token FCM usunięty z serwera');
      return true;
    } else {
      console.error('❌ Błąd usuwania tokenu z serwera');
      return false;
    }
  } catch (error) {
    console.error('❌ Błąd podczas usuwania tokenu:', error);
    return false;
  }
};

// NOWA FUNKCJA: Obsługa odświeżania tokenów FCM (Firebase v9+)
export const setupTokenRefresh = (userId) => {
  try {
    // W Firebase v9+ nie ma onTokenRefresh, więc używamy periodycznego sprawdzania
    // lub reagowania na zdarzenia visibility
    
    console.log('✅ Obsługa tokenów FCM została skonfigurowana dla userId:', userId);
    
    // Opcjonalnie: Sprawdzaj token przy powrocie do aplikacji
    const handleVisibilityChange = async () => {
      if (!document.hidden && userId) {
        try {
          const vapidKey = "BFr6_F0fqESHkNxesjiEJiiDt5nIkhRKkIiwsfSFuz9_wI58nhqmEhM8_8stPu-lqpW3oCr547gVaWnnnBMCoBg";
          const currentToken = await getToken(messaging, { vapidKey });
          
          if (currentToken) {
            // Token może się zmienić, więc zarejestruj go ponownie
            await registerToken(userId, currentToken);
            console.log('🔄 Token FCM sprawdzony/zaktualizowany przy powrocie do aplikacji');
          }
        } catch (error) {
          console.error('❌ Błąd sprawdzania tokenu:', error);
        }
      }
    };

    // Dodaj listener dla zmiany widoczności strony
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Zwróć funkcję cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    
  } catch (error) {
    console.error('❌ Błąd konfiguracji obsługi tokenów:', error);
  }
};
