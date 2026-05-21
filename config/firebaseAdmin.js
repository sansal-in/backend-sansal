const admin = require('firebase-admin');

// Initialize Firebase Admin with your service key
const serviceAccount = require('../online_meeting_key.json'); // Your downloaded file

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
});

const auth = admin.auth();
const db = admin.firestore();

module.exports = { admin, auth, db };