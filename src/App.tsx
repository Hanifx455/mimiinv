/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { LayoutDashboard, Wallet, TrendingUp, Award, DollarSign, LogIn, LogOut, User as UserIcon, Moon, Sun, LineChart as ChartIcon, ChevronRight, Copy, CheckCircle2, ShieldCheck, Users, ArrowUpRight, ArrowDownRight, Search, Check, X, Trash2, Bell, BellRing, Plus, HelpCircle, Share2, FileText } from 'lucide-react';
import { auth, db, storage, signInWithGoogle, logout, createUserWithEmailAndPassword, signInWithEmailAndPassword } from './firebase';
import { onAuthStateChanged, User, sendEmailVerification } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, query, where, addDoc, serverTimestamp, deleteDoc, runTransaction, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, Legend } from 'recharts';
import emailjs from '@emailjs/browser';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // if (errorMessage.includes('Missing or insufficient permissions')) {
  //   throw new Error(JSON.stringify(errInfo));
  // }
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [investments, setInvestments] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [allInvestments, setAllInvestments] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [amountInput, setAmountInput] = useState('');
  const [investAmountInput, setInvestAmountInput] = useState('10');
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPhotoURL, setEditPhotoURL] = useState('');
  const [editBinanceId, setEditBinanceId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'bank' | 'binance'>('binance');
  const [binanceId, setBinanceId] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [transactionFilter, setTransactionFilter] = useState<'all' | 'deposit' | 'withdrawal'>('all');
  const [adminTransactionFilter, setAdminTransactionFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [selectedAdminUser, setSelectedAdminUser] = useState<any | null>(null);
  const [selectedSector, setSelectedSector] = useState<any | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ type: 'deposit' | 'withdrawal', amount: number } | null>(null);
  const [alertSector, setAlertSector] = useState('عقارات');
  const [alertCondition, setAlertCondition] = useState<'above' | 'below'>('above');
  const [alertThreshold, setAlertThreshold] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refreshTimer, setRefreshTimer] = useState(0);
  
  // Auth State
  const [authMethod, setAuthMethod] = useState<'google' | 'email'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // KYC State
  const [kycDocumentType, setKycDocumentType] = useState('national_id');
  const [kycDocumentNumber, setKycDocumentNumber] = useState('');
  const [kycFullName, setKycFullName] = useState('');
  const [kycNationality, setKycNationality] = useState('');
  const [kycDob, setKycDob] = useState('');
  const [kycDocumentUrl, setKycDocumentUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [adminView, setAdminView] = useState<'dashboard' | 'logs'>('dashboard');

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark';
  });

  const logEvent = async (userId: string | null, type: string, message: string) => {
    try {
      await addDoc(collection(db, 'logs'), {
        userId,
        type,
        message,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error logging event:', error);
    }
  };

  // محاكاة بيانات الأداء التاريخية بناءً على الاستثمارات الحالية
  const performanceData = useMemo(() => {
    if (!userData) return [];
    
    // نبدأ من البونص الأولي
    const data = [
      { name: 'البداية', value: 10 },
      { name: 'أسبوع 1', value: 12.5 },
      { name: 'أسبوع 2', value: 11.8 },
      { name: 'أسبوع 3', value: 15.2 },
      { name: 'أسبوع 4', value: userData.balance > 15.2 ? userData.balance : 18.4 },
      { name: 'اليوم', value: userData.balance }
    ];
    return data;
  }, [userData]);

  useEffect(() => {
    if (status) {
      const timer = setTimeout(() => setStatus(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const timer = setInterval(() => {
      setRefreshTimer(prev => prev + 1);
    }, 30000); // تحديث كل 30 ثانية
    return () => clearInterval(timer);
  }, []);

  const isAdmin = useMemo(() => {
    return user?.email === 'hanilegro@gmail.com' && user?.emailVerified;
  }, [user]);

  const filteredUsers = useMemo(() => {
    if (!userSearchTerm.trim()) return allUsers;
    const term = userSearchTerm.toLowerCase();
    return allUsers.filter(u => 
      (u.displayName?.toLowerCase().includes(term)) || 
      (u.email?.toLowerCase().includes(term))
    );
  }, [allUsers, userSearchTerm]);

  useEffect(() => {
    if (isAdmin && user) {
      const unsubAllUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        const users: any[] = [];
        snapshot.forEach((doc) => users.push({ id: doc.id, ...doc.data() }));
        setAllUsers(users);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
      });

      const unsubAllTransactions = onSnapshot(collection(db, 'transactions'), (snapshot) => {
        const trans: any[] = [];
        snapshot.forEach((doc) => trans.push({ id: doc.id, ...doc.data() }));
        trans.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        setAllTransactions(trans);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'transactions');
      });

      const unsubAllInvestments = onSnapshot(collection(db, 'investments'), (snapshot) => {
        const items: any[] = [];
        snapshot.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
        setAllInvestments(items);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'investments');
      });

      const unsubAllLogs = onSnapshot(collection(db, 'logs'), (snapshot) => {
        const items: any[] = [];
        snapshot.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
        items.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        setLogs(items);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'logs');
      });

      return () => {
        unsubAllUsers();
        unsubAllTransactions();
        unsubAllInvestments();
        unsubAllLogs();
      };
    }
  }, [isAdmin, user]);

  useEffect(() => {
    let unsubListeners: () => void = () => {};

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      // Clean up previous listeners
      unsubListeners();
      
      if (currentUser) {
        let unsubUser: () => void = () => {};
        let unsubInvestments: () => void = () => {};
        let unsubTransactions: () => void = () => {};
        let unsubNotifs: () => void = () => {};
        let unsubAlerts: () => void = () => {};

        const initializeUserData = async () => {
          if (!currentUser) return;
          try {
            const userRef = doc(db, 'users', currentUser.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
              const urlParams = new URLSearchParams(window.location.search);
              const referredBy = urlParams.get('ref');
              
              const newUserData: any = {
                uid: currentUser.uid,
                email: currentUser.email,
                displayName: currentUser.displayName,
                balance: 10.00, // البونص
                hasReceivedBonus: true,
                kycStatus: 'unverified',
                referralCount: 0,
                createdAt: new Date().toISOString()
              };

              if (referredBy) {
                newUserData.referredBy = referredBy;
                // Update referrer
                try {
                  await runTransaction(db, async (transaction) => {
                    const referrerRef = doc(db, 'users', referredBy);
                    const referrerSnap = await transaction.get(referrerRef);
                    if (referrerSnap.exists()) {
                      const referrerData = referrerSnap.data();
                      const newReferralCount = (referrerData.referralCount || 0) + 1;
                      transaction.update(referrerRef, { 
                        referralCount: newReferralCount,
                        balance: (referrerData.balance || 0) + 0.5 
                      });
                      
                      const referralRef = doc(collection(db, 'referrals'));
                      transaction.set(referralRef, {
                        referrerId: referredBy,
                        referredUserId: currentUser.uid,
                        timestamp: serverTimestamp()
                      });
                    }
                  });
                } catch (e) {
                  console.error('Error updating referrer:', e);
                }
              }

              await setDoc(userRef, newUserData);
              setUserData(newUserData);
              setEditName(currentUser.displayName || '');
            } else {
              const data = userSnap.data();
              setUserData(data);
              setEditName(data.displayName || '');
            }

            // الاستماع لتحديثات بيانات المستخدم
            unsubUser = onSnapshot(userRef, (doc) => {
              setUserData(doc.data());
            }, (error) => {
              handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
            });

            // الاستماع للاستثمارات
            const q = query(collection(db, 'investments'), where('userId', '==', currentUser.uid));
            unsubInvestments = onSnapshot(q, (snapshot) => {
              const items: any[] = [];
              snapshot.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
              setInvestments(items);
            }, (error) => {
              handleFirestoreError(error, OperationType.LIST, 'investments');
            });

            // الاستماع للمعاملات
            const qTrans = query(collection(db, 'transactions'), where('userId', '==', currentUser.uid));
            unsubTransactions = onSnapshot(qTrans, (snapshot) => {
              const items: any[] = [];
              snapshot.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
              // ترتيب المعاملات حسب التاريخ (الأحدث أولاً)
              items.sort((a, b) => {
                const timeA = a.timestamp?.seconds || 0;
                const timeB = b.timestamp?.seconds || 0;
                return timeB - timeA;
              });
              setTransactions(items);
            }, (error) => {
              handleFirestoreError(error, OperationType.LIST, 'transactions');
            });

            // الاستماع للتنبيهات
            const qNotifs = query(collection(db, 'notifications'), where('userId', '==', currentUser.uid));
            unsubNotifs = onSnapshot(qNotifs, (snapshot) => {
              const items: any[] = [];
              snapshot.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
              items.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
              setNotifications(items);
            }, (error) => {
              handleFirestoreError(error, OperationType.LIST, 'notifications');
            });

            // الاستماع لتنبيهات الأداء المخصصة
            const qAlerts = query(collection(db, 'alerts'), where('userId', '==', currentUser.uid));
            unsubAlerts = onSnapshot(qAlerts, (snapshot) => {
              const items: any[] = [];
              snapshot.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
              setAlerts(items);
            }, (error) => {
              handleFirestoreError(error, OperationType.LIST, 'alerts');
            });

            setLoading(false);
          } catch (error) {
            handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
            setLoading(false);
          }
        };

        initializeUserData();

        unsubListeners = () => {
          unsubUser();
          unsubInvestments();
          unsubTransactions();
          unsubNotifs();
          unsubAlerts();
        };
      } else {
        setUserData(null);
        setInvestments([]);
        setTransactions([]);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      unsubListeners();
    };
  }, []);

  const handleCancelInvestment = async (investment: any) => {
    if (!user || !userData) return;
    
    const investmentDate = investment.timestamp?.toDate ? investment.timestamp.toDate() : new Date(investment.timestamp);
    const now = new Date();
    const diffInDays = (now.getTime() - investmentDate.getTime()) / (1000 * 60 * 60 * 24);

    if (diffInDays < 30) {
      setStatus({ type: 'error', message: 'لا يمكن إلغاء الاستثمار إلا بعد مرور 30 يوماً' });
      return;
    }

    try {
      const profit = calculateProfit(investment.amount, investment.timestamp, investment.sector);
      const totalRefund = investment.amount + profit;

      // حذف الاستثمار
      await deleteDoc(doc(db, 'investments', investment.id));

      // إعادة المبلغ والأرباح للمحفظة
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, { balance: userData.balance + totalRefund }, { merge: true });

      await logEvent(user.uid, 'استثمار', `تم إلغاء الاستثمار في ${investment.sector} واسترداد ${totalRefund.toFixed(2)}$`);
      setStatus({ type: 'success', message: `تم إلغاء الاستثمار بنجاح واسترداد ${totalRefund.toFixed(2)}$` });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'investments');
      setStatus({ type: 'error', message: 'حدث خطأ أثناء إلغاء الاستثمار' });
    }
  };

  const handleInvest = async (sector: string, amount: number) => {
    if (!user || !userData) return;
    
    // التحقق من الحد الأدنى بناءً على القطاع
    const minInvestment = sector === 'عقارات' ? 10 : 100;
    
    if (amount < minInvestment) {
      setStatus({ type: 'error', message: `الحد الأدنى للاستثمار في ${sector} هو ${minInvestment}$، لقد حاولت استثمار ${amount}$` });
      return;
    }
    
    if (userData.balance < amount) {
      setStatus({ type: 'error', message: `الرصيد غير كافٍ (المطلوب ${amount}$)` });
      return;
    }

    try {
      await addDoc(collection(db, 'investments'), {
        userId: user.uid,
        sector,
        amount,
        timestamp: serverTimestamp()
      });

      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, { ...userData, balance: userData.balance - amount }, { merge: true });
      setStatus({ type: 'success', message: `تم الاستثمار بنجاح بمبلغ ${amount}$ في قطاع ${sector}` });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'investments');
    }
  };

  const handleDeposit = async () => {
    if (!user || !userData || !amountInput) return;
    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) {
      setStatus({ type: 'error', message: 'يرجى إدخال مبلغ صحيح' });
      return;
    }
    setConfirmModal({ type: 'deposit', amount });
  };

  const executeDeposit = async (amount: number) => {
    if (!user || !userData) return;
    try {
      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        type: 'deposit',
        amount,
        method: paymentMethod,
        binanceId: paymentMethod === 'binance' ? binanceId : null,
        status: 'pending',
        timestamp: serverTimestamp()
      });

      setAmountInput('');
      setBinanceId('');
      setConfirmModal(null);
      const methodText = paymentMethod === 'binance' ? 'عبر Binance Pay' : 'عبر التحويل البنكي';
      setStatus({ type: 'success', message: `تم تسجيل طلب إيداع بمبلغ ${amount}$ ${methodText}. سيتم إضافة الرصيد بعد مراجعة الإدارة.` });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'transactions');
      setStatus({ type: 'error', message: 'حدث خطأ أثناء طلب الإيداع' });
    }
  };

  const handleWithdraw = async () => {
    if (!user || !userData || !amountInput) return;
    if (userData.kycStatus !== 'verified') {
      setStatus({ type: 'error', message: 'يجب توثيق هويتك (KYC) أولاً لتتمكن من السحب' });
      return;
    }
    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) {
      setStatus({ type: 'error', message: 'يرجى إدخال مبلغ صحيح' });
      return;
    }
    if (amount < 50) {
      setStatus({ type: 'error', message: 'الحد الأدنى للسحب هو 50$' });
      return;
    }
    if (userData.balance < amount) {
      setStatus({ type: 'error', message: 'الرصيد غير كافٍ للسحب' });
      return;
    }
    setConfirmModal({ type: 'withdrawal', amount });
  };

  const executeWithdraw = async (amount: number) => {
    if (!user || !userData) return;
    try {
      // Deduct balance immediately
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, { balance: userData.balance - amount }, { merge: true });

      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        type: 'withdrawal',
        amount,
        method: paymentMethod,
        binanceId: paymentMethod === 'binance' ? binanceId : null,
        status: 'pending',
        timestamp: serverTimestamp()
      });

      setAmountInput('');
      setBinanceId('');
      setConfirmModal(null);
      const methodText = paymentMethod === 'binance' ? 'إلى حساب Binance Pay الخاص بك' : 'إلى حسابك البنكي';
      setStatus({ type: 'success', message: `تم تسجيل طلب سحب بمبلغ ${amount}$ ${methodText}. سيتم تحويل المبلغ بعد مراجعة الإدارة.` });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'transactions');
      setStatus({ type: 'error', message: 'حدث خطأ أثناء طلب السحب' });
    }
  };

  const handleClaimProfits = async () => {
    if (!user || !userData) return;
    
    // Calculate total profits
    const totalProfits = investments.reduce((acc, inv) => acc + calculateProfit(inv.amount, inv.timestamp, inv.sector), 0);
    
    if (totalProfits <= 0) {
      setStatus({ type: 'error', message: 'لا توجد أرباح متاحة للسحب حالياً' });
      return;
    }

    try {
      // Update user balance
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, { balance: userData.balance + totalProfits }, { merge: true });

      // Reset investment timestamps to now
      for (const inv of investments) {
        const invRef = doc(db, 'investments', inv.id);
        await setDoc(invRef, { timestamp: serverTimestamp() }, { merge: true });
      }

      setStatus({ type: 'success', message: `تم إضافة ${totalProfits.toFixed(2)}$ إلى محفظتك بنجاح` });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'investments');
      setStatus({ type: 'error', message: 'حدث خطأ أثناء تحويل الأرباح' });
    }
  };

  useEffect(() => {
    if (userData) {
      setEditName(userData.displayName || '');
      setEditPhone(userData.phoneNumber || '');
      setEditAddress(userData.address || '');
      setEditPhotoURL(userData.photoURL || '');
      setEditBinanceId(userData.binanceId || '');
      if (userData.binanceId) setBinanceId(userData.binanceId);
    }
  }, [userData]);

  const handleUpdateProfile = async () => {
    if (!user || !editName.trim()) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, { 
        displayName: editName,
        phoneNumber: editPhone,
        address: editAddress,
        photoURL: editPhotoURL,
        binanceId: editBinanceId
      }, { merge: true });
      setStatus({ type: 'success', message: 'تم تحديث الملف الشخصي بنجاح' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
      setStatus({ type: 'error', message: 'حدث خطأ أثناء تحديث الملف الشخصي' });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !user) return;
    const file = e.target.files[0];
    setUploading(true);
    try {
      const storageRef = ref(storage, `kyc/${user.uid}/${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setKycDocumentUrl(url);
      setStatus({ type: 'success', message: 'تم رفع المستند بنجاح' });
    } catch (error) {
      console.error('Error uploading file:', error);
      setStatus({ type: 'error', message: 'حدث خطأ أثناء رفع المستند' });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitKyc = async () => {
    if (!user) return;
    if (!kycDocumentNumber.trim() || !kycFullName.trim() || !kycNationality.trim() || !kycDob.trim() || !kycDocumentUrl) {
      setStatus({ type: 'error', message: 'يرجى تعبئة جميع حقول التحقق من الهوية ورفع المستند' });
      return;
    }
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        kycStatus: 'pending',
        kycData: {
          documentType: kycDocumentType,
          documentNumber: kycDocumentNumber,
          fullName: kycFullName,
          nationality: kycNationality,
          dob: kycDob,
          documentUrl: kycDocumentUrl,
          submittedAt: serverTimestamp()
        }
      }, { merge: true });
      await logEvent(user.uid, 'KYC', 'تم تقديم طلب تحقق جديد مع مستند');
      setStatus({ type: 'success', message: 'تم إرسال طلب التحقق من الهوية بنجاح. قيد المراجعة.' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
      setStatus({ type: 'error', message: 'حدث خطأ أثناء تقديم طلب التحقق' });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const calculateProfit = (amount: number, timestamp: any, sector?: string) => {
    if (!timestamp) return 0;
    const startTime = timestamp.seconds ? timestamp.seconds * 1000 : new Date(timestamp).getTime();
    const now = Date.now();
    const diffInMs = now - startTime;
    const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
    
    let rate = 0.05; // Default 5%
    if (sector === 'صناعة') rate = 0.07;
    else if (sector === 'أصول (ذهب/فضة)' || sector === 'أصول') rate = 0.09;
    else if (sector === 'طاقة') rate = 0.10;
    else if (sector === 'عقارات') rate = 0.05;

    return amount * rate * diffInDays;
  };

  const AdminLogsScreen = () => {
    const [logsPage, setLogsPage] = useState(1);
    const itemsPerPage = 10;
    const sortedLogs = [...logs].sort((a, b) => b.timestamp?.toDate() - a.timestamp?.toDate());
    const paginatedLogs = sortedLogs.slice((logsPage - 1) * itemsPerPage, logsPage * itemsPerPage);
    const totalPages = Math.ceil(sortedLogs.length / itemsPerPage);

    return (
      <div className="space-y-4">
        <h3 className="font-bold text-blue-900 dark:text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" /> سجل الأحداث الكامل
        </h3>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <table className="w-full text-xs text-right">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="py-2">التاريخ</th>
                <th className="py-2">النوع</th>
                <th className="py-2">الحدث</th>
              </tr>
            </thead>
            <tbody>
              {paginatedLogs.map(log => (
                <tr key={log.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 text-gray-400">{log.timestamp?.toDate ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(log.timestamp.toDate()) : '...'}</td>
                  <td className="py-2 font-bold text-blue-600 dark:text-blue-400">{log.type}</td>
                  <td className="py-2 dark:text-white">{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between items-center mt-4">
            <button onClick={() => setLogsPage(p => Math.max(1, p - 1))} disabled={logsPage === 1} className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg text-xs">السابق</button>
            <span className="text-xs dark:text-white">صفحة {logsPage} من {totalPages}</span>
            <button onClick={() => setLogsPage(p => Math.min(totalPages, p + 1))} disabled={logsPage === totalPages} className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg text-xs">التالي</button>
          </div>
        </div>
      </div>
    );
  };

  const AdminDashboardContent = () => (
    <div className="space-y-6">
      {/* ... existing admin dashboard content ... */}
    </div>
  );

  const handleUpdateBalance = async (userId: string, newBalance: number) => {
    try {
      const userRef = doc(db, 'users', userId);
      await setDoc(userRef, { balance: newBalance }, { merge: true });
      setStatus({ type: 'success', message: 'تم تحديث الرصيد بنجاح' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
      setStatus({ type: 'error', message: 'فشل تحديث الرصيد' });
    }
  };

  const handleApproveTransaction = async (transaction: any) => {
    console.log('Attempting to approve transaction:', transaction);
    try {
      if (!transaction.userId) throw new Error('معرف المستخدم مفقود في المعاملة');
      
      const userRef = doc(db, 'users', transaction.userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) throw new Error('المستخدم غير موجود في قاعدة البيانات');
      
      const userData = userSnap.data();
      const currentBalance = userData.balance || 0;
      
      let newBalance = currentBalance;
      if (transaction.type === 'deposit') {
        newBalance = currentBalance + transaction.amount;
        // تحديث رصيد المستخدم فقط في حالة الإيداع
        await setDoc(userRef, { balance: newBalance }, { merge: true });
      }

      // تحديث حالة المعاملة
      await setDoc(doc(db, 'transactions', transaction.id), { 
        status: 'approved',
        processedAt: serverTimestamp(),
        processedBy: user?.uid
      }, { merge: true });

      const title = transaction.type === 'deposit' ? 'تم تأكيد الإيداع' : 'تم تأكيد السحب';
      const message = `لقد تمت الموافقة على عملية ${transaction.type === 'deposit' ? 'إيداع' : 'سحب'} مبلغ ${transaction.amount}$ بنجاح. رصيدك الجديد هو ${newBalance.toFixed(2)}$`;

      // إرسال تنبيه للمستخدم
      await addDoc(collection(db, 'notifications'), {
        userId: transaction.userId,
        title,
        message,
        read: false,
        timestamp: serverTimestamp()
      });

      // إرسال بريد إلكتروني (EmailJS)
      if (import.meta.env.VITE_EMAILJS_SERVICE_ID && userData.email) {
        emailjs.send(
          import.meta.env.VITE_EMAILJS_SERVICE_ID,
          import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
          {
            to_name: userData.displayName || 'مستثمرنا العزيز',
            to_email: userData.email,
            subject: title,
            message: message,
          },
          import.meta.env.VITE_EMAILJS_PUBLIC_KEY
        ).then(() => console.log('Email sent successfully'))
         .catch((err) => console.error('Failed to send email:', err));
      }

      setStatus({ type: 'success', message: 'تمت الموافقة على المعاملة وتحديث الرصيد بنجاح' });
    } catch (error: any) {
      console.error('Error in handleApproveTransaction:', error);
      handleFirestoreError(error, OperationType.WRITE, `transactions/${transaction.id}`);
      setStatus({ type: 'error', message: error.message || 'فشل الموافقة على المعاملة' });
    }
  };

  const handleRejectTransaction = async (transactionId: string) => {
    console.log('Attempting to reject transaction:', transactionId);
    try {
      const transRef = doc(db, 'transactions', transactionId);
      const transSnap = await getDoc(transRef);
      if (!transSnap.exists()) throw new Error('المعاملة غير موجودة');
      const transaction = transSnap.data();

      // Refund balance if it was a withdrawal
      if (transaction.type === 'withdrawal') {
        const userRef = doc(db, 'users', transaction.userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          await setDoc(userRef, { balance: (userData.balance || 0) + transaction.amount }, { merge: true });
        }
      }

      await setDoc(transRef, { 
        status: 'rejected',
        processedAt: serverTimestamp(),
        processedBy: user?.uid
      }, { merge: true });

      const title = transaction.type === 'deposit' ? 'تم رفض الإيداع' : 'تم رفض السحب';
      const message = `نأسف، لقد تم رفض عملية ${transaction.type === 'deposit' ? 'إيداع' : 'سحب'} مبلغ ${transaction.amount}$. يرجى التواصل مع الدعم الفني للمزيد من التفاصيل.`;

      // إرسال تنبيه بالرفض
      await addDoc(collection(db, 'notifications'), {
        userId: transaction.userId,
        title,
        message,
        read: false,
        timestamp: serverTimestamp()
      });

      await logEvent(user?.uid || null, 'معاملة', `تم رفض ${transaction.type === 'deposit' ? 'إيداع' : 'سحب'} مبلغ ${transaction.amount}$ للمستخدم ${transaction.userId}`);

      // إرسال بريد إلكتروني (EmailJS)
      const userRef = doc(db, 'users', transaction.userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists() && import.meta.env.VITE_EMAILJS_SERVICE_ID) {
        const userData = userSnap.data();
        emailjs.send(
          import.meta.env.VITE_EMAILJS_SERVICE_ID,
          import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
          {
            to_name: userData.displayName || 'مستثمرنا العزيز',
            to_email: userData.email,
            subject: title,
            message: message,
          },
          import.meta.env.VITE_EMAILJS_PUBLIC_KEY
        ).then(() => console.log('Rejection email sent successfully'))
         .catch((err) => console.error('Failed to send rejection email:', err));
      }

      setStatus({ type: 'success', message: 'تم رفض المعاملة بنجاح' });
    } catch (error: any) {
      console.error('Error in handleRejectTransaction:', error);
      handleFirestoreError(error, OperationType.WRITE, `transactions/${transactionId}`);
      setStatus({ type: 'error', message: error.message || 'فشل رفض المعاملة' });
    }
  };

  const handleApproveKyc = async (userId: string) => {
    try {
      await setDoc(doc(db, 'users', userId), { kycStatus: 'verified' }, { merge: true });
      await addDoc(collection(db, 'notifications'), {
        userId,
        title: 'تم التحقق من الهوية',
        message: 'تمت الموافقة على طلب التحقق من الهوية الخاص بك بنجاح.',
        read: false,
        timestamp: serverTimestamp()
      });
      await logEvent(user?.uid || null, 'KYC', `تمت الموافقة على طلب التحقق من الهوية للمستخدم ${userId}`);
      setStatus({ type: 'success', message: 'تمت الموافقة على طلب التحقق من الهوية' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
      setStatus({ type: 'error', message: 'حدث خطأ أثناء الموافقة على الطلب' });
    }
  };

  const handleRejectKyc = async (userId: string) => {
    try {
      await setDoc(doc(db, 'users', userId), { kycStatus: 'rejected' }, { merge: true });
      await addDoc(collection(db, 'notifications'), {
        userId,
        title: 'تحديث حالة التحقق من الهوية',
        message: 'تم رفض طلب التحقق من الهوية الخاص بك. يرجى مراجعة البيانات وإعادة التقديم.',
        read: false,
        timestamp: serverTimestamp()
      });
      await logEvent(user?.uid || null, 'KYC', `تم رفض طلب التحقق من الهوية للمستخدم ${userId}`);
      setStatus({ type: 'success', message: 'تم رفض طلب التحقق من الهوية' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
      setStatus({ type: 'error', message: 'حدث خطأ أثناء رفض الطلب' });
    }
  };

  const handleMarkNotificationAsRead = async (notifId: string) => {
    try {
      await setDoc(doc(db, 'notifications', notifId), { read: true }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `notifications/${notifId}`);
    }
  };

  const handleCreateAlert = async () => {
    if (!user || !alertThreshold) return;
    try {
      await addDoc(collection(db, 'alerts'), {
        userId: user.uid,
        sector: alertSector,
        condition: alertCondition,
        threshold: parseFloat(alertThreshold),
        active: true,
        timestamp: serverTimestamp()
      });
      setAlertThreshold('');
      setStatus({ type: 'success', message: 'تم إنشاء تنبيه الأداء بنجاح' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'alerts');
      setStatus({ type: 'error', message: 'فشل إنشاء التنبيه' });
    }
  };

  const handleDeleteAlert = async (alertId: string) => {
    try {
      await setDoc(doc(db, 'alerts', alertId), { active: false }, { merge: true });
      setStatus({ type: 'success', message: 'تم تعطيل التنبيه' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `alerts/${alertId}`);
    }
  };

  const sectors = [
    {
      id: 'عقارات',
      name: 'عقارات',
      description: 'الاستثمار في العقارات السكنية والتجارية في أرقى مناطق دبي.',
      performance: '5% يومياً',
      risk: 'منخفض',
      returns: 'عائد يومي ثابت',
      icon: TrendingUp,
      image: 'https://picsum.photos/seed/dubai-real-estate/800/400',
      history: [
        { month: 'يناير', value: 100 },
        { month: 'فبراير', value: 105 },
        { month: 'مارس', value: 108 },
        { month: 'أبريل', value: 112 },
        { month: 'مايو', value: 115 },
        { month: 'يونيو', value: 120 }
      ],
      minInvestment: 10
    },
    {
      id: 'صناعة',
      name: 'صناعة',
      description: 'دعم القطاع الصناعي والتحويلي المتنامي في المناطق الحرة.',
      performance: '7% يومياً',
      risk: 'متوسط',
      returns: 'عائد يومي ثابت',
      icon: TrendingUp,
      image: 'https://picsum.photos/seed/industry-factory/800/400',
      history: [
        { month: 'يناير', value: 100 },
        { month: 'فبراير', value: 102 },
        { month: 'مارس', value: 110 },
        { month: 'أبريل', value: 108 },
        { month: 'مايو', value: 118 },
        { month: 'يونيو', value: 125 }
      ],
      minInvestment: 100
    },
    {
      id: 'أصول',
      name: 'أصول (ذهب/فضة)',
      description: 'حماية ثروتك من خلال الاستثمار في المعادن الثمينة والأصول الآمنة.',
      performance: '9% يومياً',
      risk: 'منخفض جداً',
      returns: 'عائد يومي ثابت',
      icon: TrendingUp,
      image: 'https://picsum.photos/seed/gold-wealth/800/400',
      history: [
        { month: 'يناير', value: 100 },
        { month: 'فبراير', value: 101 },
        { month: 'مارس', value: 103 },
        { month: 'أبريل', value: 104 },
        { month: 'مايو', value: 106 },
        { month: 'يونيو', value: 108 }
      ],
      minInvestment: 100
    },
    {
      id: 'طاقة',
      name: 'طاقة',
      description: 'الاستثمار في مشاريع الطاقة المتجددة والنفط والغاز.',
      performance: '10% يومياً',
      risk: 'متوسط',
      returns: 'عائد يومي ثابت',
      icon: TrendingUp,
      image: 'https://picsum.photos/seed/renewable-energy/800/400',
      history: [
        { month: 'يناير', value: 100 },
        { month: 'فبراير', value: 108 },
        { month: 'مارس', value: 115 },
        { month: 'أبريل', value: 112 },
        { month: 'مايو', value: 125 },
        { month: 'يونيو', value: 135 }
      ],
      minInvestment: 100
    }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center transition-colors duration-300 gap-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-blue-100 dark:border-blue-900/30"></div>
          <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
        </div>
        <p className="text-blue-600 dark:text-blue-400 font-medium animate-pulse">جاري التحميل...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-6 text-center transition-colors duration-300">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl max-w-md w-full space-y-6">
          <div className="bg-blue-100 dark:bg-blue-900/30 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
            <TrendingUp className="w-10 h-10 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-blue-900 dark:text-white">Pips Investment</h1>
          <p className="text-gray-600 dark:text-gray-400">سجل الدخول الآن وابدأ استثمارك مع بونص 10$ مجاناً عند التسجيل.</p>
          
          <div className="flex gap-2 mb-6">
            <button onClick={() => setAuthMethod('google')} className={`flex-1 py-2 text-sm rounded-lg ${authMethod === 'google' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700'}`}>جوجل</button>
            <button onClick={() => setAuthMethod('email')} className={`flex-1 py-2 text-sm rounded-lg ${authMethod === 'email' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700'}`}>بريد</button>
          </div>

          {authMethod === 'google' && (
            <button
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 py-3 rounded-xl font-semibold text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
              تسجيل الدخول باستخدام جوجل
            </button>
          )}

          {authMethod === 'email' && (
            <div className="space-y-4">
              <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 border rounded-lg" />
              <input type="password" placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 border rounded-lg" />
              <button onClick={async () => {
                try {
                  await createUserWithEmailAndPassword(auth, email, password).catch(e => signInWithEmailAndPassword(auth, email, password));
                } catch (error: any) {
                  if (error.code === 'auth/operation-not-allowed') {
                    alert('خطأ: طريقة تسجيل الدخول هذه غير مفعلة في إعدادات Firebase. يرجى تفعيلها من لوحة تحكم Firebase.');
                  } else {
                    alert('حدث خطأ: ' + error.message);
                  }
                }
              }} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold">تسجيل / دخول</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const handleSendVerification = async () => {
    if (!user) return;
    try {
      await sendEmailVerification(user);
      setVerificationSent(true);
      setStatus({ type: 'success', message: 'تم إرسال رابط التحقق إلى بريدك الإلكتروني' });
    } catch (error) {
      console.error('Error sending verification:', error);
      setStatus({ type: 'error', message: 'فشل إرسال رابط التحقق' });
    }
  };

  const exportToCSV = () => {
    if (!investments.length && !transactions.length) {
      setStatus({ type: 'error', message: 'لا توجد بيانات للتصدير' });
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // Add BOM for Arabic support
    
    // Investments
    csvContent += "الاستثمارات\n";
    csvContent += "القطاع,المبلغ,التاريخ\n";
    investments.forEach(inv => {
      const date = inv.timestamp?.toDate ? inv.timestamp.toDate().toLocaleDateString('fr-FR') : '';
      csvContent += `${inv.sector},${inv.amount},${date}\n`;
    });

    csvContent += "\nالمعاملات\n";
    csvContent += "النوع,المبلغ,الحالة,التاريخ\n";
    transactions.forEach(trans => {
      const date = trans.timestamp?.toDate ? trans.timestamp.toDate().toLocaleDateString('fr-FR') : '';
      const type = trans.type === 'deposit' ? 'إيداع' : 'سحب';
      const status = trans.status === 'approved' ? 'مكتمل' : trans.status === 'pending' ? 'قيد الانتظار' : 'مرفوض';
      csvContent += `${type},${trans.amount},${status},${date}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "history.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setStatus({ type: 'success', message: 'تم تصدير البيانات بنجاح' });
  };

  const renderContent = () => {
    // شاشة التحقق من البريد الإلكتروني
    if (!user.emailVerified && !isAdmin) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 text-center p-6 animate-in fade-in duration-500">
          <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
            <ShieldCheck className="w-10 h-10 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-blue-900 dark:text-white">تحقق من بريدك الإلكتروني</h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
              يرجى التحقق من بريدك الإلكتروني <span className="font-bold text-blue-600">{user.email}</span> لتفعيل حسابك والبدء في الاستثمار.
            </p>
          </div>
          
          <div className="w-full max-w-xs space-y-3">
            <button
              onClick={handleSendVerification}
              disabled={verificationSent}
              className={`w-full py-4 rounded-xl font-bold transition-all shadow-lg active:scale-95 ${
                verificationSent 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20'
              }`}
            >
              {verificationSent ? 'تم إرسال الرابط' : 'إرسال رابط التحقق'}
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 text-sm font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors"
            >
              لقد قمت بالتحقق، حدث الصفحة
            </button>
          </div>
          
          <button
            onClick={logout}
            className="flex items-center gap-2 text-gray-400 hover:text-red-600 transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" /> تسجيل الخروج
          </button>
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-gradient-to-r from-blue-800 to-blue-600 rounded-2xl p-6 text-white relative overflow-hidden shadow-lg">
              <div className="relative z-10">
                <h2 className="text-2xl font-bold">مرحباً، {user.displayName}</h2>
                <p className="opacity-90">رصيدك الحالي جاهز للاستثمار في أفضل القطاعات.</p>
              </div>
              <div className="absolute top-0 right-0 opacity-10 transform translate-x-1/4 -translate-y-1/4">
                <TrendingUp className="w-48 h-48" />
              </div>
            </div>

            {/* قسم الأداء السريع */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-blue-900 dark:text-white">نمو المحفظة</h3>
                <ChartIcon className="w-5 h-5 text-blue-600" />
              </div>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={performanceData}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#374151' : '#f3f4f6'} />
                    <XAxis dataKey="name" hide />
                    <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                        borderColor: isDarkMode ? '#374151' : '#e5e7eb',
                        color: isDarkMode ? '#ffffff' : '#000000',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                      labelStyle={{ display: 'none' }}
                    />
                    <Area type="monotone" dataKey="value" stroke="#2563eb" fillOpacity={1} fill="url(#colorValue)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center transition-colors">
                <TrendingUp className="w-8 h-8 text-green-500 mb-2" />
                <span className="text-sm text-gray-500 dark:text-gray-400">الاستثمارات</span>
                <span className="font-bold dark:text-white">{investments.length}</span>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center transition-colors">
                <DollarSign className="w-8 h-8 text-blue-500 mb-2" />
                <span className="text-sm text-gray-500 dark:text-gray-400">إجمالي الأرباح</span>
                <span className="font-bold dark:text-white">
                  {investments.reduce((acc, inv) => acc + calculateProfit(inv.amount, inv.timestamp, inv.sector), 0).toFixed(2)}$
                </span>
              </div>
            </div>

            {/* قائمة الاستثمارات النشطة مع الأرباح */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-blue-900 dark:text-white">الاستثمارات النشطة</h3>
                <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">تحديث مباشر</span>
              </div>
              
              {investments.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 p-8 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 text-center">
                  <p className="text-xs text-gray-400">لا توجد استثمارات نشطة حالياً</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {investments.map((inv) => {
                    const profit = calculateProfit(inv.amount, inv.timestamp, inv.sector);
                    return (
                      <div key={inv.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex justify-between items-center animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="flex items-center gap-3">
                          <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded-lg">
                            <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                          </div>
                          <div>
                            <p className="text-sm font-bold dark:text-white">{inv.sector}</p>
                            <p className="text-[10px] text-gray-400">المبلغ: {inv.amount}$</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-green-600 dark:text-green-400">+{profit.toFixed(4)}$</p>
                          <p className="text-[10px] text-gray-400">الربح المتراكم</p>
                          
                          {/* زر الإلغاء */}
                          {(Date.now() - (inv.timestamp?.seconds * 1000 || new Date(inv.timestamp).getTime())) / (1000 * 60 * 60 * 24) >= 30 && (
                            <button
                              onClick={() => handleCancelInvestment(inv)}
                              className="mt-2 text-[10px] bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-2 py-1 rounded-md hover:bg-red-100 transition-colors"
                            >
                              إلغاء الاستثمار
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      case 'investments':
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-bold text-blue-900 dark:text-white">فرص الاستثمار</h2>
            
            {selectedSector ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden animate-in fade-in zoom-in duration-300">
                <div className="h-48 w-full relative">
                  <img src={selectedSector.image} alt={selectedSector.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-6">
                    <div className="flex items-center gap-4">
                      <button onClick={() => setSelectedSector(null)} className="p-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full transition-colors">
                        <ChevronRight className="w-6 h-6 text-white" />
                      </button>
                      <h3 className="text-2xl font-bold text-white">{selectedSector.name}</h3>
                    </div>
                  </div>
                </div>
                
                <div className="p-6 space-y-6">
                  <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl">
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                      {selectedSector.description}
                    </p>
                  </div>

                  {/* مخطط الأداء التاريخي للقطاع */}
                  <div className="space-y-3">
                    <h4 className="font-bold text-sm text-gray-500 dark:text-gray-400">الأداء التاريخي (آخر 6 أشهر)</h4>
                    <div className="h-48 w-full bg-gray-50 dark:bg-gray-700/30 rounded-xl p-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={selectedSector.history}>
                          <defs>
                            <linearGradient id="colorSector" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
                          <XAxis dataKey="month" fontSize={10} tick={{ fill: isDarkMode ? '#9ca3af' : '#6b7280' }} />
                          <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                              borderColor: isDarkMode ? '#374151' : '#e5e7eb',
                              color: isDarkMode ? '#ffffff' : '#000000',
                              borderRadius: '8px',
                              fontSize: '10px'
                            }}
                          />
                          <Area type="monotone" dataKey="value" stroke="#2563eb" fillOpacity={1} fill="url(#colorSector)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-bold text-sm text-gray-500 dark:text-gray-400">تحليل الاستثمار</h4>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="bg-white dark:bg-gray-700 p-4 rounded-xl border border-gray-100 dark:border-gray-600 flex justify-between items-center shadow-sm">
                        <div className="flex items-center gap-2">
                          <ChartIcon className="w-4 h-4 text-blue-500" />
                          <span className="text-sm dark:text-gray-300">الأداء التاريخي</span>
                        </div>
                        <span className="font-bold text-blue-600 dark:text-blue-400">{selectedSector.performance} سنوياً</span>
                      </div>
                      <div className="bg-white dark:bg-gray-700 p-4 rounded-xl border border-gray-100 dark:border-gray-600 flex justify-between items-center shadow-sm">
                        <div className="flex items-center gap-2">
                          <Award className="w-4 h-4 text-yellow-500" />
                          <span className="text-sm dark:text-gray-300">تقييم المخاطر</span>
                        </div>
                        <span className={`font-bold ${selectedSector.risk === 'منخفض' ? 'text-green-600' : selectedSector.risk === 'مرتفع' ? 'text-red-600' : 'text-yellow-600'}`}>
                          {selectedSector.risk}
                        </span>
                      </div>
                      <div className="bg-white dark:bg-gray-700 p-4 rounded-xl border border-gray-100 dark:border-gray-600 flex justify-between items-center shadow-sm">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-green-500" />
                          <span className="text-sm dark:text-gray-300">العوائد المتوقعة</span>
                        </div>
                        <span className="font-bold text-green-600 dark:text-green-400">{selectedSector.returns}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">المبلغ المراد استثماره ($)</label>
                      <input
                        type="number"
                        value={investAmountInput}
                        onChange={(e) => setInvestAmountInput(e.target.value)}
                        min="10"
                        placeholder="أدخل المبلغ (الحد الأدنى 100$ للخطط العادية، 10$ للعقار)"
                        className="w-full p-4 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white font-bold text-lg"
                      />
                    </div>
                    <button
                      onClick={() => {
                        handleInvest(selectedSector.name, parseFloat(investAmountInput));
                        setSelectedSector(null);
                        setInvestAmountInput('10');
                      }}
                      className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 text-lg"
                    >
                      تأكيد الاستثمار بمبلغ {investAmountInput}$
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl p-6 text-white shadow-lg flex items-center justify-between animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div>
                    <p className="text-blue-100 text-sm mb-1 font-medium">إجمالي الأرباح المتراكمة</p>
                    <h3 className="text-3xl font-bold">
                      ${investments.reduce((acc, inv) => acc + calculateProfit(inv.amount, inv.timestamp, inv.sector), 0).toFixed(2)}
                    </h3>
                    <p className="text-xs text-blue-200 mt-2">من جميع استثماراتك النشطة</p>
                  </div>
                  <div className="bg-white/20 p-4 rounded-full backdrop-blur-sm">
                    <TrendingUp className="w-8 h-8 text-white" />
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">نظام الدعوات</h3>
                  <div className="flex items-center gap-2 mb-2">
                    <input 
                      type="text" 
                      readOnly 
                      value={`${window.location.origin}/?ref=${user?.uid}`} 
                      className="w-full p-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-600 dark:text-gray-300"
                    />
                    <button 
                      onClick={() => navigator.clipboard.writeText(`${window.location.origin}/?ref=${user?.uid}`)}
                      className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    عدد الدعوات: {userData?.referralCount || 0} / 50
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {sectors.map((item) => (
                    <div 
                      key={item.id} 
                      onClick={() => setSelectedSector(item)}
                      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer group overflow-hidden flex flex-col"
                    >
                      <div className="h-32 w-full relative overflow-hidden">
                        <img 
                          src={item.image} 
                          alt={item.name} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                        <div className="absolute bottom-3 right-3 flex items-center gap-2">
                          <div className="bg-white/20 backdrop-blur-md p-1.5 rounded-lg">
                            <item.icon className="w-4 h-4 text-white" />
                          </div>
                          <h3 className="font-bold text-white text-lg">{item.name}</h3>
                        </div>
                      </div>
                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 line-clamp-2">{item.description}</p>
                        <div className="flex justify-between items-center pt-3 border-t border-gray-50 dark:border-gray-700/50">
                          <div className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3 text-green-500" />
                            <span className="text-xs font-bold text-green-600 dark:text-green-400">{item.performance}</span>
                          </div>
                          <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                            الحد الأدنى: {item.minInvestment}$
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${item.risk === 'منخفض' || item.risk === 'منخفض جداً' ? 'bg-green-50 text-green-600 dark:bg-green-900/20' : item.risk === 'مرتفع' ? 'bg-red-50 text-red-600 dark:bg-red-900/20' : 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20'}`}>
                            مخاطر: {item.risk}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* قسم تنبيهات الأداء */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
                  <div className="flex items-center gap-2 text-blue-900 dark:text-white">
                    <BellRing className="w-5 h-5" />
                    <h3 className="font-bold">تنبيهات الأداء المخصصة</h3>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <select 
                        value={alertSector}
                        onChange={(e) => setAlertSector(e.target.value)}
                        className="p-2 text-xs rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 dark:text-white"
                      >
                        {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <select 
                        value={alertCondition}
                        onChange={(e) => setAlertCondition(e.target.value as any)}
                        className="p-2 text-xs rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 dark:text-white"
                      >
                        <option value="above">أعلى من</option>
                        <option value="below">أقل من</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <input 
                        type="number"
                        value={alertThreshold}
                        onChange={(e) => setAlertThreshold(e.target.value)}
                        placeholder="نسبة العائد المستهدفة (%)"
                        className="flex-1 p-2 text-xs rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 dark:text-white"
                      />
                      <button 
                        onClick={handleCreateAlert}
                        className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    {alerts.filter(a => a.active).length === 0 ? (
                      <p className="text-[10px] text-gray-400 text-center py-2">لا توجد تنبيهات نشطة حالياً</p>
                    ) : (
                      alerts.filter(a => a.active).map(alert => (
                        <div key={alert.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                              <Bell className="w-3 h-3 text-blue-600" />
                            </div>
                            <div>
                              <p className="text-xs font-bold dark:text-white">{alert.sector}</p>
                              <p className="text-[10px] text-gray-500">
                                {alert.condition === 'above' ? 'عندما يتجاوز' : 'عندما يقل عن'} {alert.threshold}%
                              </p>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleDeleteAlert(alert.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      case 'certificates':
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-bold text-blue-900 dark:text-white">شهادات الاستثمار</h2>
            {investments.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">لا توجد استثمارات حالياً للحصول على شهادات.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {investments.map((inv) => (
                  <div key={inv.id} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                        <Award className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg dark:text-white">{inv.sector}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">مبلغ الاستثمار: {inv.amount}$</p>
                      </div>
                    </div>
                    <button className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors">
                      تحميل الشهادة
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 'wallet':
        const filteredTransactions = transactions.filter(t => 
          transactionFilter === 'all' ? true : t.type === transactionFilter
        );

        const investmentBreakdown = investments.reduce((acc, inv) => {
          acc[inv.sector] = (acc[inv.sector] || 0) + inv.amount;
          return acc;
        }, {} as Record<string, number>);

        const pieData = Object.entries(investmentBreakdown).map(([name, value]) => ({ name, value }));
        const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-blue-900 dark:text-white">المحفظة</h2>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all active:scale-95"
              >
                <Copy className="w-4 h-4" />
                تصدير CSV
              </button>
            </div>
            
            {status && (
              <div className={`p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${
                status.type === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                <div className={`p-1 rounded-full ${status.type === 'success' ? 'bg-green-200 dark:bg-green-800' : 'bg-red-200 dark:bg-red-800'}`}>
                  {status.type === 'success' ? <Award className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                </div>
                <span className="text-sm font-bold">{status.message}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center space-y-4 transition-colors relative overflow-hidden">
                <div className="space-y-2">
                  <p className="text-gray-500 dark:text-gray-400 font-medium">الرصيد المتاح</p>
                  <p className="text-4xl font-bold text-blue-900 dark:text-blue-400">{userData?.balance.toFixed(2)} $</p>
                </div>
                
                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400">الأرباح المتراكمة</span>
                    <span className="font-bold text-green-600 dark:text-green-400">
                      {investments.reduce((acc, inv) => acc + calculateProfit(inv.amount, inv.timestamp, inv.sector), 0).toFixed(4)} $
                    </span>
                  </div>
                  <button
                    onClick={handleClaimProfits}
                    className="w-full bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 py-3 rounded-xl font-bold hover:bg-green-100 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <TrendingUp className="w-5 h-5" />
                    إضافة الأرباح للمحفظة
                  </button>
                </div>

                <div className="absolute -bottom-4 -right-4 opacity-5 pointer-events-none">
                  <Wallet className="w-24 h-24 text-blue-900" />
                </div>
              </div>
              
              {pieData.length > 0 && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                  <h3 className="text-lg font-bold text-blue-900 dark:text-white mb-4">توزيع الاستثمارات</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          fill="#8884d8"
                          label
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
            
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-4 transition-colors">
              <div className="space-y-3">
                <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">وسيلة الدفع</label>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => setPaymentMethod('binance')}
                    className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${paymentMethod === 'binance' ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' : 'border-gray-100 dark:border-gray-700'}`}
                  >
                    <div className="w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center text-[8px] font-bold text-black">B</div>
                    <span className={`text-[10px] font-bold ${paymentMethod === 'binance' ? 'text-yellow-600' : 'text-gray-500'}`}>Binance Pay</span>
                  </button>
                </div>
              </div>

              {paymentMethod === 'binance' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30 p-4 rounded-xl space-y-3">
                    <div className="text-xs font-bold text-yellow-800 dark:text-yellow-500 flex items-center gap-2">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                      تعليمات الإيداع المباشر
                    </div>
                    <p className="text-[10px] text-gray-600 dark:text-gray-400">
                      يرجى إرسال المبلغ المطلوب إلى معرف Binance Pay الخاص بالمنصة أدناه، ثم قم بتأكيد العملية.
                    </p>
                    <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-lg border border-yellow-100 dark:border-yellow-900/20">
                      <div>
                        <p className="text-[9px] text-gray-400 uppercase font-bold">Platform Binance ID</p>
                        <p className="text-sm font-mono font-bold text-blue-900 dark:text-white">112575707</p>
                      </div>
                      <button
                        onClick={() => copyToClipboard('112575707')}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-1"
                      >
                        {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
                        <span className="text-[10px] font-bold text-gray-500">{copied ? 'تم النسخ' : 'نسخ'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">Binance Pay ID الخاص بك</label>
                    <input
                      type="text"
                      value={binanceId}
                      onChange={(e) => setBinanceId(e.target.value)}
                      placeholder="أدخل معرف Binance الخاص بك"
                      className="w-full p-3 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 bg-white dark:bg-gray-700 dark:text-white"
                    />
                    <p className="text-[10px] text-gray-400">سيتم استخدام هذا المعرف للتحقق من عملية {amountInput ? 'الإيداع' : 'السحب'} (الحد الأدنى للسحب 50$)</p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">المبلغ ($)</label>
                  <span className="text-[10px] text-red-500 font-bold">الحد الأدنى للسحب: 50$</span>
                </div>
                <input
                  type="number"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-3 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={handleDeposit}
                  className={`${paymentMethod === 'binance' ? 'bg-yellow-500 hover:bg-yellow-600 shadow-yellow-500/20' : 'bg-green-600 hover:bg-green-700 shadow-green-600/20'} text-white py-4 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 shadow-lg active:scale-95 transform duration-100`}
                >
                  <DollarSign className="w-5 h-5" /> إيداع
                </button>
                <button
                  onClick={handleWithdraw}
                  className="bg-red-600 text-white py-4 rounded-xl font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 active:scale-95 transform duration-100"
                >
                  <Wallet className="w-5 h-5" /> سحب
                </button>
              </div>
            </div>

            {/* سجل المعاملات */}
            <div className="space-y-4 pt-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-blue-900 dark:text-white">سجل المعاملات</h3>
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                  {[
                    { id: 'all', label: 'الكل' },
                    { id: 'deposit', label: 'إيداع' },
                    { id: 'withdrawal', label: 'سحب' }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setTransactionFilter(f.id as any)}
                      className={`px-3 py-1 rounded-md text-[10px] font-bold transition-colors ${
                        transactionFilter === f.id 
                        ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' 
                        : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="space-y-3">
                {filteredTransactions.length === 0 ? (
                  <div className="bg-white dark:bg-gray-800 p-8 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 text-center text-gray-400">
                    لا توجد معاملات {transactionFilter !== 'all' ? (transactionFilter === 'deposit' ? 'إيداع' : 'سحب') : ''} سابقة
                  </div>
                ) : (
                  filteredTransactions.map((trans) => (
                    <div key={trans.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex justify-between items-center hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${trans.type === 'deposit' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                          {trans.method === 'binance' ? (
                            <div className="w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center text-[8px] font-bold text-black">B</div>
                          ) : trans.type === 'deposit' ? (
                            <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
                          ) : (
                            <Wallet className="w-5 h-5 text-red-600 dark:text-red-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold dark:text-white text-sm">
                            {trans.type === 'deposit' ? 'إيداع رصيد' : 'سحب رصيد'} 
                            {trans.method === 'binance' && <span className="text-[10px] text-yellow-600 mr-1">(Binance)</span>}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {trans.timestamp?.toDate ? (
                              new Intl.DateTimeFormat('fr-FR', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              }).format(trans.timestamp.toDate())
                            ) : 'جاري المعالجة...'}
                          </p>
                        </div>
                      </div>
                      <div className="text-left flex flex-col items-end gap-1">
                        <span className={`font-bold block ${trans.type === 'deposit' ? 'text-green-600' : 'text-red-600'}`}>
                          {trans.type === 'deposit' ? '+' : '-'}{trans.amount.toFixed(2)} $
                        </span>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                          trans.status === 'approved' ? 'bg-green-100 text-green-600' : 
                          trans.status === 'pending' ? 'bg-yellow-100 text-yellow-600' : 'bg-red-100 text-red-600'
                        }`}>
                          {trans.status === 'approved' ? 'مكتملة' : trans.status === 'pending' ? 'قيد الانتظار' : 'مرفوضة'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      case 'certificates':
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-bold text-blue-900 dark:text-white">الشهادات والتراخيص</h2>
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center space-y-4 transition-colors">
              <div className="bg-yellow-50 dark:bg-yellow-900/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                <Award className="w-12 h-12 text-yellow-500" />
              </div>
              <div>
                <p className="font-bold text-xl text-blue-900 dark:text-white">ترخيص هيئة الأوراق المالية - دبي</p>
                <p className="text-gray-500 dark:text-gray-400 mt-1">رقم الترخيص المعتمد: DFSA-2026-001</p>
              </div>
              <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-400 dark:text-gray-500">هذه المنصة مرخصة لمزاولة الأنشطة الاستثمارية في دولة الإمارات العربية المتحدة.</p>
              </div>
            </div>
          </div>
        );
      case 'performance':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-bold text-blue-900 dark:text-white">أداء المحفظة</h2>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
              <div className="mb-6">
                <p className="text-sm text-gray-500 dark:text-gray-400">إجمالي العائد</p>
                <p className="text-3xl font-bold text-green-600">+12.4%</p>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#374151' : '#f3f4f6'} />
                    <XAxis 
                      dataKey="name" 
                      stroke={isDarkMode ? '#9ca3af' : '#6b7280'} 
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      stroke={isDarkMode ? '#9ca3af' : '#6b7280'} 
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `$${value}`}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                        borderColor: isDarkMode ? '#374151' : '#e5e7eb',
                        color: isDarkMode ? '#ffffff' : '#000000',
                        borderRadius: '12px'
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#2563eb" 
                      strokeWidth={4} 
                      dot={{ r: 6, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 8 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="font-bold text-blue-900 dark:text-white mb-4">تفاصيل النمو</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">أعلى قيمة</span>
                  <span className="font-bold dark:text-white">$18.40</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">أدنى قيمة</span>
                  <span className="font-bold dark:text-white">$10.00</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">متوسط النمو الشهري</span>
                  <span className="font-bold text-green-600">+3.2%</span>
                </div>
              </div>
            </div>
          </div>
        );
      case 'support':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-bold text-blue-900 dark:text-white">فتح تذكرة دعم</h2>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const subject = formData.get('subject') as string;
                  const message = formData.get('message') as string;
                  
                  try {
                    await addDoc(collection(db, 'tickets'), {
                      userId: user?.uid,
                      userEmail: user?.email,
                      subject,
                      message,
                      status: 'open',
                      createdAt: serverTimestamp()
                    });
                    
                    // Send email notification
                    await emailjs.send(
                      import.meta.env.VITE_EMAILJS_SERVICE_ID,
                      import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
                      {
                        to_email: 'invstmimi@gmail.com',
                        from_name: user?.displayName || 'مستثمر',
                        subject: subject,
                        message: message,
                        reply_to: user?.email,
                      },
                      import.meta.env.VITE_EMAILJS_PUBLIC_KEY
                    );

                    setStatus({ type: 'success', message: 'تم إرسال التذكرة بنجاح' });
                    (e.target as HTMLFormElement).reset();
                  } catch (error) {
                    console.error('Error creating ticket:', error);
                    setStatus({ type: 'error', message: 'حدث خطأ أثناء إرسال التذكرة' });
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">الموضوع</label>
                  <input name="subject" required className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">الرسالة</label>
                  <textarea name="message" required rows={4} className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 dark:text-white" />
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors">إرسال التذكرة</button>
              </form>
            </div>
          </div>
        );
      case 'profile':
        const avatars = [
          'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
          'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
          'https://api.dicebear.com/7.x/avataaars/svg?seed=Jameson',
          'https://api.dicebear.com/7.x/avataaars/svg?seed=Willow',
          'https://api.dicebear.com/7.x/avataaars/svg?seed=Jack',
        ];

        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-bold text-blue-900 dark:text-white">الملف الشخصي</h2>
            
            {status && activeTab === 'profile' && (
              <div className={`p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${
                status.type === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                <span className="text-sm font-bold">{status.message}</span>
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors space-y-6">
              <div className="flex flex-col items-center space-y-4">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-blue-50 dark:border-blue-900/30 shadow-md">
                    {editPhotoURL ? (
                      <img src={editPhotoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <UserIcon className="w-12 h-12 text-blue-600 dark:text-blue-400" />
                      </div>
                    )}
                  </div>
                  <label className="absolute bottom-0 right-0 p-2 bg-blue-600 text-white rounded-full cursor-pointer hover:bg-blue-700 shadow-lg">
                    <Plus className="w-4 h-4" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        if (e.target.files && e.target.files[0] && user) {
                          const file = e.target.files[0];
                          try {
                            const storageRef = ref(storage, `profiles/${user.uid}/${file.name}`);
                            await uploadBytes(storageRef, file);
                            const url = await getDownloadURL(storageRef);
                            setEditPhotoURL(url);
                            setStatus({ type: 'success', message: 'تم تحديث الصورة بنجاح' });
                          } catch (error) {
                            console.error('Error uploading profile photo:', error);
                            setStatus({ type: 'error', message: 'حدث خطأ أثناء رفع الصورة' });
                          }
                        }
                      }}
                    />
                  </label>
                </div>
                
                <div className="text-center">
                  <p className="font-bold text-blue-900 dark:text-white">{userData?.displayName || 'مستثمر جديد'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
                  {!user.emailVerified && (
                    <button
                      onClick={async () => {
                        try {
                          await sendEmailVerification(user);
                          setStatus({ type: 'success', message: 'تم إرسال رابط التحقق بنجاح' });
                        } catch (error) {
                          console.error('Error sending verification email:', error);
                          setStatus({ type: 'error', message: 'حدث خطأ أثناء إرسال الرابط' });
                        }
                      }}
                      className="mt-2 text-xs text-blue-600 hover:underline"
                    >
                      إعادة إرسال رابط التحقق
                    </button>
                  )}
                </div>

                <div className="w-full bg-gray-50 dark:bg-gray-700 p-4 rounded-xl space-y-3">
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 text-center">كود الدعوة الخاص بك</p>
                  
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                    <p className="text-xs text-blue-800 dark:text-blue-300 text-center leading-relaxed">
                      شارك كود الدعوة الخاص بك مع أصدقائك! احصل على مكافآت عند تسجيلهم واستثمارهم في Pips Investment.
                    </p>
                  </div>

                  {userData?.referralCode ? (
                    <div className="flex items-center justify-center gap-2">
                      <span className="font-mono text-lg font-bold text-blue-600 dark:text-blue-400">{userData.referralCode}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/?ref=${userData.referralCode}`);
                          setStatus({ type: 'success', message: 'تم نسخ رابط الدعوة' });
                        }}
                        className="p-2 text-gray-500 hover:text-blue-600 transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (navigator.share) {
                            navigator.share({
                              title: 'انضم إلينا في Pips Investment',
                              text: `استخدم كودي ${userData.referralCode} للانضمام وابدأ رحلتك الاستثمارية!`,
                              url: `${window.location.origin}/?ref=${userData.referralCode}`
                            });
                          }
                        }}
                        className="p-2 text-gray-500 hover:text-blue-600 transition-colors"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        try {
                          const newCode = user.uid.substring(0, 6).toUpperCase();
                          await updateDoc(doc(db, 'users', user.uid), { referralCode: newCode });
                          setStatus({ type: 'success', message: 'تم إنشاء كود الدعوة' });
                        } catch (error) {
                          console.error('Error generating referral code:', error);
                          setStatus({ type: 'error', message: 'حدث خطأ أثناء إنشاء الكود' });
                        }
                      }}
                      className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 transition-colors"
                    >
                      إنشاء كود دعوة
                    </button>
                  )}
                </div>

                <div className="w-full space-y-3">
                  <p className="text-xs font-bold text-gray-400 text-center">اختر صورة رمزية</p>
                  <div className="flex justify-center gap-2">
                    {avatars.map((url) => (
                      <button
                        key={url}
                        onClick={() => setEditPhotoURL(url)}
                        className={`w-10 h-10 rounded-full overflow-hidden border-2 transition-all ${editPhotoURL === url ? 'border-blue-600 scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'}`}
                      >
                        <img src={url} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">الاسم المستعار</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="أدخل اسمك"
                    className="w-full p-3 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">رقم الهاتف</label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="+971 XX XXX XXXX"
                    className="w-full p-3 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">العنوان</label>
                  <textarea
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    placeholder="دبي، الإمارات العربية المتحدة"
                    rows={2}
                    className="w-full p-3 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">Binance Pay ID</label>
                  <input
                    type="text"
                    value={editBinanceId}
                    onChange={(e) => setEditBinanceId(e.target.value)}
                    placeholder="112575707"
                    className="w-full p-3 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 bg-white dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <button
                  onClick={handleUpdateProfile}
                  className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                >
                  حفظ التغييرات
                </button>
              </div>
            </div>

            {/* KYC Section */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-blue-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-blue-500" />
                  التحقق من الهوية (KYC)
                </h3>
                {userData?.kycStatus === 'verified' && (
                  <span className="px-3 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-bold rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> موثق
                  </span>
                )}
                {userData?.kycStatus === 'pending' && (
                  <span className="px-3 py-1 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs font-bold rounded-full">
                    قيد المراجعة
                  </span>
                )}
                {userData?.kycStatus === 'rejected' && (
                  <span className="px-3 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs font-bold rounded-full">
                    مرفوض
                  </span>
                )}
                {(!userData?.kycStatus || userData?.kycStatus === 'unverified') && (
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 text-xs font-bold rounded-full">
                    غير موثق
                  </span>
                )}
              </div>

              {userData?.kycStatus === 'verified' ? (
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-xl border border-green-100 dark:border-green-800/30 text-center">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" />
                  <p className="text-green-800 dark:text-green-400 font-bold">هويتك موثقة بنجاح</p>
                  <p className="text-xs text-green-600 dark:text-green-500 mt-1">يمكنك الآن الاستمتاع بجميع ميزات المنصة بدون قيود.</p>
                </div>
              ) : userData?.kycStatus === 'pending' ? (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-xl border border-yellow-100 dark:border-yellow-800/30 text-center">
                  <ShieldCheck className="w-12 h-12 text-yellow-500 mx-auto mb-2 animate-pulse" />
                  <p className="text-yellow-800 dark:text-yellow-400 font-bold">جاري مراجعة بياناتك</p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-1">سنقوم بإعلامك فور الانتهاء من مراجعة طلبك.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {userData?.kycStatus === 'rejected' && (
                    <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-sm text-red-700 dark:text-red-400 mb-4">
                      تم رفض طلبك السابق. يرجى التأكد من صحة البيانات وإعادة التقديم.
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">نوع المستند</label>
                    <select
                      value={kycDocumentType}
                      onChange={(e) => setKycDocumentType(e.target.value)}
                      className="w-full p-3 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                    >
                      <option value="national_id">بطاقة هوية وطنية</option>
                      <option value="passport">جواز سفر</option>
                      <option value="driving_license">رخصة قيادة</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">الاسم الكامل (كما في المستند)</label>
                    <input
                      type="text"
                      value={kycFullName}
                      onChange={(e) => setKycFullName(e.target.value)}
                      placeholder="الاسم الكامل"
                      className="w-full p-3 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">رقم المستند</label>
                    <input
                      type="text"
                      value={kycDocumentNumber}
                      onChange={(e) => setKycDocumentNumber(e.target.value)}
                      placeholder="أدخل رقم المستند"
                      className="w-full p-3 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">تحميل صورة المستند</label>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setStatus({ type: 'success', message: 'تم اختيار الملف: ' + e.target.files[0].name });
                        }
                      }}
                      className="w-full p-3 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">الجنسية</label>
                      <input
                        type="text"
                        value={kycNationality}
                        onChange={(e) => setKycNationality(e.target.value)}
                        placeholder="مثال: إماراتي"
                        className="w-full p-3 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">تاريخ الميلاد</label>
                      <input
                        type="date"
                        value={kycDob}
                        onChange={(e) => setKycDob(e.target.value)}
                        className="w-full p-3 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">صورة المستند</label>
                    <input
                      type="file"
                      onChange={handleFileUpload}
                      className="w-full p-3 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white"
                      disabled={uploading}
                    />
                    {uploading && <p className="text-xs text-blue-500">جاري الرفع...</p>}
                    {kycDocumentUrl && <p className="text-xs text-green-500">تم رفع المستند بنجاح</p>}
                  </div>
                  <button
                    onClick={handleSubmitKyc}
                    className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 mt-4"
                    disabled={uploading}
                  >
                    {uploading ? 'جاري الرفع...' : 'تقديم طلب التحقق'}
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
              <h3 className="font-bold text-blue-900 dark:text-white">إعدادات الحساب</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors cursor-pointer">
                  <span className="text-sm dark:text-gray-300">تغيير اللغة</span>
                  <span className="text-xs text-blue-600">العربية</span>
                </div>
                <div className="flex justify-between items-center p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors cursor-pointer">
                  <span className="text-sm dark:text-gray-300">الإشعارات</span>
                  <span className="text-xs text-green-600">مفعلة</span>
                </div>
                <button
                  onClick={logout}
                  className="w-full flex items-center justify-center gap-2 p-3 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors mt-4"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm font-bold">تسجيل الخروج</span>
                </button>
              </div>
            </div>
          </div>
        );
      case 'admin':
        if (!isAdmin) return null;
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-blue-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-red-600" />
                {adminView === 'dashboard' ? 'لوحة تحكم المدير' : 'سجل الأحداث'}
              </h2>
              <button 
                onClick={() => setAdminView(adminView === 'dashboard' ? 'logs' : 'dashboard')}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700"
              >
                {adminView === 'dashboard' ? 'عرض سجل الأحداث' : 'العودة للوحة التحكم'}
              </button>
            </div>

            <div style={{ display: adminView === 'dashboard' ? 'block' : 'none' }}>
              {/* إحصائيات سريعة */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                  <Users className="w-4 h-4" />
                  <span className="text-xs">إجمالي المستخدمين</span>
                </div>
                <p className="text-xl font-bold dark:text-white">{allUsers.length}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-xs">إجمالي الإيداعات</span>
                </div>
                <p className="text-xl font-bold text-green-600">
                  {allTransactions.filter(t => t.type === 'deposit' && t.status === 'approved').reduce((acc, curr) => acc + curr.amount, 0).toFixed(2)} $
                </p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-xs">حجم الاستثمارات</span>
                </div>
                <p className="text-xl font-bold text-blue-600">
                  {allInvestments.reduce((acc, curr) => acc + curr.amount, 0).toFixed(2)} $
                </p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                  <Wallet className="w-4 h-4" />
                  <span className="text-xs">إجمالي السحوبات</span>
                </div>
                <p className="text-xl font-bold text-red-600">
                  {allTransactions.filter(t => t.type === 'withdrawal' && t.status === 'approved').reduce((acc, curr) => acc + curr.amount, 0).toFixed(2)} $
                </p>
              </div>
            </div>

            {/* الرسوم البيانية */}
            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="font-bold text-blue-900 dark:text-white mb-4 text-sm">نمو الاستثمارات والإيداعات</h3>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={[
                      { name: 'يناير', investments: 1200, deposits: 1500 },
                      { name: 'فبراير', investments: 1900, deposits: 2200 },
                      { name: 'مارس', investments: 2400, deposits: 2800 },
                      { name: 'أبريل', investments: 3100, deposits: 3500 },
                      { name: 'مايو', investments: 4000, deposits: 4200 },
                      { name: 'الحالي', investments: allInvestments.reduce((acc, curr) => acc + curr.amount, 0) + 4000, deposits: allTransactions.filter(t => t.type === 'deposit' && t.status === 'approved').reduce((acc, curr) => acc + curr.amount, 0) + 4200 }
                    ]}>
                      <defs>
                        <linearGradient id="colorInv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorDep" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#16a34a" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#374151' : '#f3f4f6'} />
                      <XAxis dataKey="name" fontSize={10} tick={{ fill: isDarkMode ? '#9ca3af' : '#6b7280' }} />
                      <YAxis hide />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                          borderColor: isDarkMode ? '#374151' : '#e5e7eb',
                          color: isDarkMode ? '#ffffff' : '#000000',
                          borderRadius: '8px',
                          fontSize: '12px'
                        }}
                      />
                      <Area type="monotone" dataKey="investments" name="الاستثمارات" stroke="#2563eb" fillOpacity={1} fill="url(#colorInv)" strokeWidth={2} />
                      <Area type="monotone" dataKey="deposits" name="الإيداعات" stroke="#16a34a" fillOpacity={1} fill="url(#colorDep)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>


            {/* إدارة المستخدمين */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="font-bold text-blue-900 dark:text-white flex items-center gap-2">
                  <Users className="w-5 h-5" /> إدارة المستخدمين
                </h3>
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="بحث بالاسم أو البريد الإلكتروني..."
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    className="w-full pr-10 pl-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition-all"
                  />
                  {userSearchTerm && (
                    <button 
                      onClick={() => setUserSearchTerm('')}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {selectedAdminUser ? (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-blue-100 dark:border-blue-900/30 space-y-6 animate-in fade-in zoom-in duration-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button onClick={() => setSelectedAdminUser(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                        <ChevronRight className="w-6 h-6 text-blue-600" />
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-bold text-blue-900 dark:text-white">{selectedAdminUser.displayName || 'مستخدم'}</h3>
                          {selectedAdminUser.kycStatus === 'verified' && (
                            <CheckCircle2 className="w-4 h-4 text-green-500" title="موثق" />
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{selectedAdminUser.email}</p>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] text-gray-400 uppercase font-bold">الرصيد الحالي</p>
                      <p className="text-xl font-bold text-blue-600">{selectedAdminUser.balance?.toFixed(2)} $</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                      <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold mb-1">إجمالي الاستثمار</p>
                      <p className="text-lg font-bold dark:text-white">
                        {allInvestments.filter(inv => inv.userId === selectedAdminUser.uid).reduce((acc, curr) => acc + curr.amount, 0).toFixed(2)} $
                      </p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-xl border border-green-100 dark:border-green-900/30">
                      <p className="text-[10px] text-green-600 dark:text-green-400 font-bold mb-1">الأرباح المحققة</p>
                      <p className="text-lg font-bold text-green-600">
                        {allInvestments.filter(inv => inv.userId === selectedAdminUser.uid).reduce((acc, curr) => acc + calculateProfit(curr.amount, curr.timestamp, curr.sector), 0).toFixed(2)} $
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-bold text-sm text-gray-500 dark:text-gray-400">محفظة الاستثمار</h4>
                    <div className="space-y-2">
                      {allInvestments.filter(inv => inv.userId === selectedAdminUser.uid).length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">لا توجد استثمارات نشطة لهذا المستخدم</p>
                      ) : (
                        allInvestments.filter(inv => inv.userId === selectedAdminUser.uid).map(inv => (
                          <div key={inv.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                                <TrendingUp className="w-4 h-4 text-blue-600" />
                              </div>
                              <div>
                                <p className="text-xs font-bold dark:text-white">{inv.sector}</p>
                                <p className="text-[10px] text-gray-400">المبلغ: {inv.amount}$</p>
                              </div>
                            </div>
                            <div className="text-left">
                              <p className="text-xs font-bold text-green-600">+{calculateProfit(inv.amount, inv.timestamp, inv.sector).toFixed(4)}$</p>
                              <p className="text-[9px] text-gray-400">ربح متراكم</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredUsers.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 text-center">
                      <p className="text-gray-500 dark:text-gray-400 text-sm">لم يتم العثور على مستخدمين يطابقون بحثك.</p>
                    </div>
                  ) : (
                    filteredUsers.map(u => (
                      <div key={u.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setSelectedAdminUser(u)}>
                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center overflow-hidden">
                              {u.photoURL ? <img src={u.photoURL} className="w-full h-full object-cover" /> : <UserIcon className="w-5 h-5 text-blue-600" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-1">
                                <p className="font-bold text-sm dark:text-white hover:text-blue-600 transition-colors">{u.displayName || 'بدون اسم'}</p>
                                {u.kycStatus === 'verified' && (
                                  <CheckCircle2 className="w-3 h-3 text-green-500" title="موثق" />
                                )}
                              </div>
                              <p className="text-[10px] text-gray-400">{u.email}</p>
                            </div>
                          </div>
                          <div className="text-left">
                            <p className="text-xs text-gray-400">الرصيد</p>
                            <p className="font-bold text-blue-600">{u.balance?.toFixed(2)} $</p>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-2 border-t border-gray-50 dark:border-gray-700">
                          <button 
                            onClick={() => {
                              const amount = prompt('أدخل الرصيد الجديد:', u.balance);
                              if (amount !== null) handleUpdateBalance(u.id, parseFloat(amount));
                            }}
                            className="flex-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 py-2 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors"
                          >
                            تعديل الرصيد
                          </button>
                          <button 
                            onClick={() => setSelectedAdminUser(u)}
                            className="flex-1 bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 py-2 rounded-lg text-xs font-bold hover:bg-gray-100 transition-colors"
                          >
                            عرض المحفظة
                          </button>
                          <button className="p-2 text-gray-400 hover:text-red-600 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* طلبات KYC */}
            <div className="space-y-4">
              <h3 className="font-bold text-blue-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" /> طلبات التحقق من الهوية (KYC)
              </h3>
              <div className="space-y-3">
                {allUsers.filter(u => u.kycStatus === 'pending').length === 0 ? (
                  <div className="bg-white dark:bg-gray-800 p-8 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 text-center">
                    <p className="text-gray-500 dark:text-gray-400 text-sm">لا توجد طلبات تحقق قيد الانتظار.</p>
                  </div>
                ) : (
                  allUsers.filter(u => u.kycStatus === 'pending').map(u => (
                    <div key={u.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center overflow-hidden">
                            <ShieldCheck className="w-5 h-5 text-yellow-600" />
                          </div>
                          <div>
                            <p className="font-bold text-sm dark:text-white">{u.displayName || 'بدون اسم'}</p>
                            <p className="text-[10px] text-gray-400">{u.email}</p>
                          </div>
                        </div>
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 text-[10px] font-bold rounded-full">
                          قيد المراجعة
                        </span>
                      </div>
                      
                      <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg text-xs space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-gray-400">نوع المستند:</span>
                          <span className="font-bold dark:text-white">
                            {u.kycData?.documentType === 'passport' ? 'جواز سفر' : u.kycData?.documentType === 'driving_license' ? 'رخصة قيادة' : 'بطاقة هوية وطنية'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-gray-400">الاسم في المستند:</span>
                          <span className="font-bold dark:text-white">{u.kycData?.fullName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-gray-400">رقم المستند:</span>
                          <span className="font-bold dark:text-white">{u.kycData?.documentNumber}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-gray-400">الجنسية:</span>
                          <span className="font-bold dark:text-white">{u.kycData?.nationality}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-gray-400">تاريخ الميلاد:</span>
                          <span className="font-bold dark:text-white">{u.kycData?.dob}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-gray-400">المستند:</span>
                          <a href={u.kycData?.documentUrl} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline font-bold">عرض المستند</a>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2 border-t border-gray-50 dark:border-gray-700">
                        <button 
                          onClick={() => handleApproveKyc(u.id)}
                          className="flex-1 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 py-2 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors flex items-center justify-center gap-1"
                        >
                          <Check className="w-4 h-4" /> قبول
                        </button>
                        <button 
                          onClick={() => handleRejectKyc(u.id)}
                          className="flex-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 py-2 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-1"
                        >
                          <X className="w-4 h-4" /> رفض
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* مراقبة المعاملات */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-blue-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" /> مراقبة المعاملات
                </h3>
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                  {['all', 'pending', 'approved', 'rejected'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setAdminTransactionFilter(f as any)}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
                        adminTransactionFilter === f 
                        ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' 
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                      }`}
                    >
                      {f === 'all' ? 'الكل' : f === 'pending' ? 'المعلقة' : f === 'approved' ? 'المقبولة' : 'المرفوضة'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {allTransactions
                  .filter(t => adminTransactionFilter === 'all' || t.status === adminTransactionFilter)
                  .map(t => {
                    const transUser = allUsers.find(u => u.uid === t.userId);
                    return (
                      <div key={t.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl ${t.type === 'deposit' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                              {t.type === 'deposit' ? <ArrowUpRight className="w-5 h-5 text-green-600" /> : <ArrowDownRight className="w-5 h-5 text-red-600" />}
                            </div>
                            <div>
                              <p className="text-sm font-bold dark:text-white">{transUser?.displayName || 'مستخدم غير معروف'}</p>
                              <p className="text-[10px] text-gray-400">{transUser?.email}</p>
                            </div>
                          </div>
                          <div className="text-left">
                            <p className={`text-lg font-bold ${t.type === 'deposit' ? 'text-green-600' : 'text-red-600'}`}>
                              {t.type === 'deposit' ? '+' : '-'}{t.amount.toFixed(2)} $
                            </p>
                            <p className="text-[10px] text-gray-400">
                              {t.timestamp?.toDate ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(t.timestamp.toDate()) : '...'}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 py-2 border-t border-b border-gray-50 dark:border-gray-700">
                          <div className="space-y-1">
                            <p className="text-[10px] text-gray-400">طريقة الدفع</p>
                            <p className="text-xs font-bold dark:text-white flex items-center gap-1">
                              {t.method === 'binance' ? 'Binance Pay' : 'حوالة بنكية'}
                              {t.method === 'binance' && <span className="text-[10px] text-yellow-600">(ID: {t.binanceId || 'N/A'})</span>}
                            </p>
                          </div>
                          <div className="space-y-1 text-left">
                            <p className="text-[10px] text-gray-400">رصيد المستخدم الحالي</p>
                            <p className="text-xs font-bold text-blue-600">{transUser?.balance?.toFixed(2) || '0.00'} $</p>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-1">
                          {t.status === 'pending' ? (
                            <>
                              <button 
                                onClick={() => handleApproveTransaction(t)}
                                className="flex-1 bg-green-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                              >
                                <Check className="w-4 h-4" /> تأكيد العملية
                              </button>
                              <button 
                                onClick={() => handleRejectTransaction(t.id)}
                                className="flex-1 bg-red-50 dark:bg-red-900/20 text-red-600 py-2 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                              >
                                <X className="w-4 h-4" /> رفض
                              </button>
                            </>
                          ) : (
                            <div className={`w-full py-2 rounded-lg text-xs font-bold text-center ${
                              t.status === 'approved' ? 'bg-green-50 text-green-600 dark:bg-green-900/20' : 'bg-red-50 text-red-600 dark:bg-red-900/20'
                            }`}>
                              الحالة: {t.status === 'approved' ? 'مقبولة ومكتملة' : 'مرفوضة'}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                {allTransactions.filter(t => adminTransactionFilter === 'all' || t.status === adminTransactionFilter).length === 0 && (
                  <div className="bg-white dark:bg-gray-800 p-8 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 text-center">
                    <p className="text-gray-500 dark:text-gray-400 text-sm">لا توجد معاملات في هذا القسم حالياً.</p>
                  </div>
                )}
              </div>
            </div>

            {/* سجل الأحداث */}
            <div className="space-y-4">
              <h3 className="font-bold text-blue-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" /> سجل الأحداث
              </h3>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-2 max-h-96 overflow-y-auto">
                {logs.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-sm text-center">لا توجد سجلات حالياً.</p>
                ) : (
                  logs.map(log => (
                    <div key={log.id} className="text-xs border-b border-gray-100 dark:border-gray-700 py-2">
                      <span className="text-gray-400">[{log.timestamp?.toDate ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(log.timestamp.toDate()) : '...'}]</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400 mx-2">{log.type}</span>
                      <span className="dark:text-white">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            </div>
            {adminView === 'logs' && <AdminLogsScreen />}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col font-sans transition-colors duration-300">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm p-4 flex justify-between items-center sticky top-0 z-50 transition-colors">
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-1.5 rounded-xl shadow-md">
            <img 
              src="https://api.dicebear.com/7.x/shapes/svg?seed=PipsInvestment&backgroundColor=transparent" 
              alt="Pips Investment Logo" 
              className="w-6 h-6"
              referrerPolicy="no-referrer"
            />
          </div>
          <h1 className="text-lg font-bold text-blue-900 dark:text-white">Pips Investment</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowNotifications(true)}
            className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors relative"
          >
            <Bell className="w-5 h-5" />
            {notifications.filter(n => !n.read).length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-gray-800" />
            )}
          </button>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-full">
            <DollarSign className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="font-bold text-blue-900 dark:text-blue-400 text-sm">{userData?.balance.toFixed(2)} $</span>
          </div>
          <button onClick={logout} className="p-2 text-gray-400 hover:text-red-600 transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 pb-24">
        {renderContent()}
      </main>

      {/* Navigation Bar */}
      <nav className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-3 flex justify-around fixed bottom-0 left-0 right-0 z-50 transition-colors">
        {[
          { id: 'dashboard', icon: LayoutDashboard, label: 'الرئيسية' },
          { id: 'investments', icon: TrendingUp, label: 'الاستثمارات' },
          { id: 'performance', icon: ChartIcon, label: 'الأداء' },
          { id: 'wallet', icon: Wallet, label: 'المحفظة' },
          { id: 'certificates', icon: FileText, label: 'شهاداتي' },
          { id: 'support', icon: HelpCircle, label: 'الدعم' },
          { id: 'profile', icon: UserIcon, label: 'حسابي' },
          isAdmin && { id: 'admin', icon: ShieldCheck, label: 'الإدارة' },
        ].filter(Boolean).map((tab: any) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === tab.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}
          >
            <tab.icon className={`w-6 h-6 ${activeTab === tab.id ? 'fill-blue-50 dark:fill-blue-900/20' : ''}`} />
            <span className="text-[10px] font-bold">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Footer Disclaimer */}
      <footer className="p-4 text-center text-[10px] text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 transition-colors">
        تنبيه: هذا التطبيق هو نموذج أولي لأغراض العرض فقط. لا توجد معاملات حقيقية. جميع البيانات المعروضة هي بيانات تجريبية.
      </footer>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-6 animate-in zoom-in-95 duration-200">
            <div className="text-center space-y-2">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${confirmModal.type === 'deposit' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                {confirmModal.type === 'deposit' ? (
                  <DollarSign className={`w-8 h-8 ${confirmModal.type === 'deposit' ? 'text-green-600' : 'text-red-600'}`} />
                ) : (
                  <Wallet className="w-8 h-8 text-red-600" />
                )}
              </div>
              <h3 className="text-xl font-bold text-blue-900 dark:text-white">تأكيد العملية</h3>
              <p className="text-gray-500 dark:text-gray-400">
                هل أنت متأكد من رغبتك في {confirmModal.type === 'deposit' ? 'إيداع' : 'سحب'} مبلغ <span className="font-bold text-blue-600 dark:text-blue-400">{confirmModal.amount}$</span>؟
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="py-3 rounded-xl font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={() => confirmModal.type === 'deposit' ? executeDeposit(confirmModal.amount) : executeWithdraw(confirmModal.amount)}
                className={`py-3 rounded-xl font-bold text-white transition-colors shadow-lg ${confirmModal.type === 'deposit' ? 'bg-green-600 hover:bg-green-700 shadow-green-600/20' : 'bg-red-600 hover:bg-red-700 shadow-red-600/20'}`}
              >
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Modal */}
      {showNotifications && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <h3 className="font-bold text-blue-900 dark:text-white flex items-center gap-2">
                <Bell className="w-5 h-5" /> التنبيهات
              </h3>
              <button onClick={() => setShowNotifications(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {notifications.length === 0 ? (
                <div className="text-center py-10 text-gray-400">لا توجد تنبيهات حالياً</div>
              ) : (
                notifications.map(n => (
                  <div 
                    key={n.id} 
                    onClick={() => handleMarkNotificationAsRead(n.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${n.read ? 'bg-gray-50 dark:bg-gray-900/50 border-gray-100 dark:border-gray-700 opacity-60' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/30 shadow-sm'}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <h4 className={`font-bold text-sm ${n.read ? 'text-gray-600 dark:text-gray-400' : 'text-blue-900 dark:text-blue-400'}`}>{n.title}</h4>
                      <span className="text-[8px] text-gray-400">
                        {n.timestamp?.toDate ? new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(n.timestamp.toDate()) : '...'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{n.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
