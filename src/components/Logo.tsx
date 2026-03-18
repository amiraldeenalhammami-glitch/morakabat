import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';

interface LogoProps {
  className?: string;
  showText?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ className = "w-12 h-12", showText = true }) => {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setLogoUrl(data.app_logo_url || null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/global');
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {logoUrl ? (
        <img src={logoUrl} alt="App Logo" className="w-full h-full object-contain rounded-xl" referrerPolicy="no-referrer" />
      ) : (
        <div className="w-full h-full bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl">
          A
        </div>
      )}
      {showText && (
        <div className="flex flex-col">
          <span className="text-xl font-bold text-indigo-600 leading-tight">نظام المراقبات</span>
          <span className="text-[10px] text-slate-500">كلية الهندسة المعمارية</span>
        </div>
      )}
    </div>
  );
};
