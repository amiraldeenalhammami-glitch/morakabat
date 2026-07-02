const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

exports.deleteStudent = onCall(async (request) => {
  // 1. التحقق من المصادقة
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
  }

  const adminUid = request.auth.uid;
  const studentUid = request.data.studentUid;

  if (!studentUid) {
    throw new HttpsError("invalid-argument", "يجب تحديد معرف الطالب.");
  }

  try {
    const db = admin.firestore();
    
    // 2. التحقق من صلاحيات الأدمن
    const adminDoc = await db.collection('users').doc(adminUid).get();
    const adminData = adminDoc.data();
    
    const isSuperAdmin = request.auth.token.email === "amiraldeenalhammami@ab3adacademy.com";
    const isAdmin = adminData?.role === 'admin' || isSuperAdmin;

    if (!isAdmin) {
      throw new HttpsError("permission-denied", "ليس لديك صلاحية لحذف الطلاب.");
    }

    console.log(`Admin ${adminUid} is deleting student ${studentUid}`);

    // 3. حذف الحساب من Firebase Auth
    try {
      await admin.auth().deleteUser(studentUid);
    } catch (authError) {
      if (authError.code !== 'auth/user-not-found') {
        throw authError;
      }
    }

    // 4. حذف وثيقة المستخدم من Firestore
    await db.collection('users').doc(studentUid).delete();

    // 5. حذف البيانات المرتبطة (الحجوزات)
    const bookingsSnapshot = await db.collection('bookings')
      .where('student_id', '==', studentUid)
      .get();
      
    if (!bookingsSnapshot.empty) {
      const batch = db.batch();
      bookingsSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    }

    return { success: true, message: "تم حذف الطالب وبياناته بنجاح." };
  } catch (error) {
    console.error("Error deleting student:", error);
    throw new HttpsError("internal", error.message || "حدث خطأ أثناء الحذف.");
  }
});
