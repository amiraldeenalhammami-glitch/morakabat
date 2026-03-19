import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserPlus, Mail, Lock, User, Phone, IdCard, Building, AlertCircle, Camera, Image as ImageIcon, CheckCircle } from 'lucide-react';
import { uploadToCloudinary } from '../utils/cloudinary';
import { Logo } from '../components/Logo';

export default function Register() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    university_id: '',
    department: '',
    requested_role: 'student' as 'student' | 'admin',
  });
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [idCardImage, setIdCardImage] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [isEmailInUse, setIsEmailInUse] = useState(false);
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsEmailInUse(false);
    setSuccess('');

    if (formData.password.length < 6) {
      setError('يجب أن تكون كلمة المرور 6 أحرف على الأقل');
      return;
    }

    setLoading(true);
    await completeRegistration();
  };

  const completeRegistration = async () => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      // Send verification email
      await sendEmailVerification(user);

      let profileImageUrl = '';
      let idCardImageUrl = '';

      if (profileImage) {
        try {
          profileImageUrl = await uploadToCloudinary(profileImage);
        } catch (err) {
          console.error('Profile image upload failed:', err);
        }
      }

      if (idCardImage) {
        try {
          idCardImageUrl = await uploadToCloudinary(idCardImage);
        } catch (err) {
          console.error('ID card image upload failed:', err);
        }
      }

      await setDoc(doc(db, 'users', user.uid), {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        university_id: formData.university_id,
        department: formData.department,
        role: 'student',
        requested_role: formData.requested_role,
        status: 'pending',
        profile_image_url: profileImageUrl,
        id_card_image_url: idCardImageUrl,
        admin_note: '',
        student_note: '',
        required_hours: 16, // Default
        createdAt: new Date().toISOString(),
      });

      setSuccess('تم إنشاء الحساب بنجاح! تم إرسال رابط التحقق إلى بريدك الإلكتروني. يرجى تفعيل الحساب قبل تسجيل الدخول.');
      setTimeout(() => navigate('/login'), 6000);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError('هذا البريد الإلكتروني مسجل لدينا بالفعل.');
        setIsEmailInUse(true);
      } else {
        setError('حدث خطأ أثناء إنشاء الحساب. يرجى المحاولة مرة أخرى.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 py-12">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl p-8">
        <div className="flex flex-col items-center mb-8">
          <Logo className="w-16 h-16" showText={false} />
          <h1 className="text-3xl font-bold text-indigo-600 mt-4">إنشاء حساب جديد</h1>
          <p className="text-slate-500 mt-2 text-center">انضم إلى نظام المراقبات الامتحانية كطالب مراقب</p>
          <p className="text-xs text-slate-400 mt-1">جامعة دمشق كلية الهندسة المعمارية</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl flex flex-col gap-3 text-sm">
            <div className="flex items-center gap-3">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
            {isEmailInUse && (
              <div className="flex flex-col gap-2 mt-2 pt-3 border-t border-red-100">
                <Link to="/forgot-password" className="text-indigo-600 font-bold hover:underline flex items-center gap-1">
                  هل نسيت كلمة المرور؟
                </Link>
                <Link to="/login" className="text-indigo-600 font-bold hover:underline flex items-center gap-1">
                  الذهاب لتسجيل الدخول
                </Link>
              </div>
            )}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center gap-3 text-sm">
            <CheckCircle size={18} />
            <span>{success}</span>
          </div>
        )}

        {!success ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">الاسم الكامل</label>
                <div className="relative">
                  <User className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    name="name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="الاسم الثلاثي"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">البريد الإلكتروني</label>
                <div className="relative">
                  <Mail className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="example@univ.edu"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">كلمة المرور</label>
                <div className="relative">
                  <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={6}
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">رقم الهاتف</label>
                <div className="relative">
                  <Phone className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    name="phone"
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="05xxxxxxxx"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">الرقم الجامعي</label>
                <div className="relative">
                  <IdCard className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    name="university_id"
                    type="text"
                    required
                    value={formData.university_id}
                    onChange={handleChange}
                    className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="2024xxxx"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">القسم / التخصص</label>
                <div className="relative">
                  <Building className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    name="department"
                    type="text"
                    required
                    value={formData.department}
                    onChange={handleChange}
                    className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="علوم الحاسب"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">نوع الحساب المطلوب</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, requested_role: 'student' })}
                    className={`py-3 px-4 rounded-2xl border-2 transition-all font-bold text-sm ${
                      formData.requested_role === 'student'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                        : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                    }`}
                  >
                    طالب
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, requested_role: 'admin' })}
                    className={`py-3 px-4 rounded-2xl border-2 transition-all font-bold text-sm ${
                      formData.requested_role === 'admin'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                        : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                    }`}
                  >
                    مدير
                  </button>
                </div>
              </div>

              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">الصورة الشخصية (اختياري)</label>
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-all overflow-hidden relative">
                    {profileImage ? (
                      <div className="flex flex-col items-center">
                        <CheckCircle size={24} className="text-emerald-500 mb-1" />
                        <span className="text-xs text-slate-500 px-2 text-center truncate w-full">{profileImage.name}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <Camera size={24} className="text-slate-400 mb-1" />
                        <span className="text-xs text-slate-400">اختر صورة</span>
                      </div>
                    )}
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => setProfileImage(e.target.files?.[0] || null)} />
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">صورة البطاقة الجامعية (اختياري)</label>
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-all overflow-hidden relative">
                    {idCardImage ? (
                      <div className="flex flex-col items-center">
                        <CheckCircle size={24} className="text-emerald-500 mb-1" />
                        <span className="text-xs text-slate-500 px-2 text-center truncate w-full">{idCardImage.name}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <ImageIcon size={24} className="text-slate-400 mb-1" />
                        <span className="text-xs text-slate-400">اختر صورة</span>
                      </div>
                    )}
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => setIdCardImage(e.target.files?.[0] || null)} />
                  </label>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <UserPlus size={20} />
                  <span>إنشاء الحساب</span>
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">تم التسجيل بنجاح!</h2>
            <p className="text-slate-600">يرجى التحقق من بريدك الإلكتروني لتفعيل الحساب قبل تسجيل الدخول.</p>
            <Link to="/login" className="mt-6 inline-block text-indigo-600 font-bold hover:underline">
              العودة لتسجيل الدخول
            </Link>
          </div>
        )}

        <p className="mt-8 text-center text-slate-600">
          لديك حساب بالفعل؟{' '}
          <Link to="/login" className="text-indigo-600 font-bold hover:underline">
            تسجيل الدخول
          </Link>
        </p>

        <div className="mt-8 pt-6 border-t text-center">
          <p className="text-[10px] text-slate-400">
            صمم هذا التطبيق بواسطة{' '}
            <a 
              href="https://www.facebook.com/amir.aldeen.alhammami/?locale=ar_AR" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-indigo-500 hover:underline font-medium"
            >
              م.أمير الدين الحمامي
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
