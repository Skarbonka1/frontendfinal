import { initializeApp } from "firebase/app";
// Potrzebujemy 'getMessaging', a nie 'getAnalytics'
import { getMessaging } from "firebase/messaging";

// Ten obiekt jest poprawny
const firebaseConfig = {
  apiKey: "AIzaSyCXhP15S7zXavrYJFWDxGkOZSGWep3pAsQ",
  authDomain: "powiadomienia-strona-fir-a125c.firebaseapp.com",
  projectId: "powiadomienia-strona-fir-a125c",
  storageBucket: "powiadomienia-strona-fir-a125c.firebasestorage.app",
  messagingSenderId: "842492443343",
  appId: "1:842492443343:web:ec0b4851d94738faa355ba"
};

const app = initializeApp(firebaseConfig);

// Inicjalizujemy i eksportujemy 'messaging', a nie 'analytics'
export const messaging = getMessaging(app);
