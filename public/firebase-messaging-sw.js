// Wczytujemy biblioteki dla 'app' i 'messaging'
importScripts("https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js");

// Ten obiekt jest poprawny
const firebaseConfig = {
  apiKey: "AIzaSyCXhP15S7zXavrYJFWDxGkOZSGWep3pAsQ",
  authDomain: "powiadomienia-strona-fir-a125c.firebaseapp.com",
  projectId: "powiadomienia-strona-fir-a125c",
  storageBucket: "powiadomienia-strona-fir-a125c.firebasestorage.app",
  messagingSenderId: "842492443343",
  appId: "1:842492443343:web:ec0b4851d94738faa355ba"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Otrzymano wiadomość w tle: ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/vite.svg'
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});
