import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Keypair } from '@solana/web3.js';
import { AuthService } from '../services/authService';
import type { TossUser } from '../types/tossUser';

type WalletContextType = {
  isInitialized: boolean;
  isUnlocked: boolean;
  user: TossUser | null;
  keypair: Keypair | null;
  unlockWallet: () => Promise<boolean>;
  lockWallet: () => Promise<void>;
  signIn: (walletAddress: string, isTemporary?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
};

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [user, setUser] = useState<TossUser | null>(null);
  const [keypair, setKeypair] = useState<Keypair | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const session = await AuthService.getSession();
        if (session) {
          // In a real app, you'd fetch the user from your backend
          const { user: sessionUser } = await AuthService.signInWithWallet(
            session.walletAddress
          );
          setUser(sessionUser);
          setIsUnlocked(await AuthService.isWalletUnlocked());
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setIsInitialized(true);
      }
    };

    checkAuth();
  }, []);

  const unlockWallet = async (): Promise<boolean> => {
    try {
      // Biometric authentication REQUIRED - throws if not authorized
      const unlockedKeypair = await AuthService.unlockWalletWithBiometrics();
      if (unlockedKeypair) {
        // Keypair held ONLY in React state memory (NOT persisted to disk)
        setKeypair(unlockedKeypair);
        setIsUnlocked(true);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Biometric authentication failed:', error);
      setIsUnlocked(false);
      setKeypair(null);
      return false;
    }
  };

  const lockWallet = async (): Promise<void> => {
    // Clear keypair from memory (from React state)
    // Encrypted keypair remains stored securely (requires biometric to re-unlock)
    setKeypair(null);
    setIsUnlocked(false);
  };

  const signIn = async (
    walletAddress: string,
    isTemporary: boolean = false
  ): Promise<void> => {
    const { user: sessionUser } = await AuthService.signInWithWallet(
      walletAddress,
      isTemporary
    );
    setUser(sessionUser);
    setIsUnlocked(true);
  };

  const signOut = async (): Promise<void> => {
    // Clear session from storage
    await AuthService.signOut();

    // Clear all memory (state)
    setUser(null);
    setKeypair(null); // Remove from RAM
    setIsUnlocked(false);

    // NOTE: Encrypted keypair remains in SecureStore
    // It can only be accessed again with biometric authentication
  };

  return (
    <WalletContext.Provider
      value={{
        isInitialized,
        isUnlocked,
        user,
        keypair,
        unlockWallet,
        lockWallet,
        signIn,
        signOut,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = (): WalletContextType => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

export default WalletContext;
