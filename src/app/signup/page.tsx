
'use client';

import { useState, type FC, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useAuth, useUser, setDocumentNonBlocking } from '@/firebase';
import { useFirestore } from '@/firebase';
import {
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { doc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { OAuthButtons } from '@/components/OAuthButton';

const AppLogo: FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2l4.8 4.8L21.6 12l-4.8 4.8L12 21.6l-4.8-4.8L2.4 12l4.8-4.8L12 2z" />
      <path d="M8.5 12.5l2 2 5-5" />
    </svg>
);
  

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'admin' | 'joinee' | 'developer'>('joinee');
  const [isLoading, setIsLoading] = useState(false);
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  if (isUserLoading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      if (user) {
        const userDocRef = doc(firestore, 'users', user.uid);
        const userData = {
          id: user.uid,
          email: user.email,
          username: username,
          role: role,
          dailyVoteCount: 0,
          lastVoteTimestamp: serverTimestamp(),
        };
        setDocumentNonBlocking(userDocRef, userData, { merge: true });
        
        if (role === 'admin') {
            const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
            setDocumentNonBlocking(adminRoleRef, { role: 'admin' }, { merge: true });
        }

        router.push('/');
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Sign Up Failed',
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <div className="mb-8 flex items-center gap-2 text-2xl font-semibold">
          <AppLogo className="h-8 w-8 text-primary" />
          <span className="text-3xl">AgoraVote</span>
        </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Sign Up</CardTitle>
          <CardDescription>
            Create an account to start voting.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
             <div className="grid gap-2">
                <Label>Sign up with your favorite provider</Label>
                <OAuthButtons auth={auth} onSuccess={() => router.push('/')} role={role} />
            </div>
            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                    Or continue with
                    </span>
                </div>
            </div>
            <form onSubmit={handleSignUp} className="grid gap-4">
                <div className="grid gap-2">
                <Label htmlFor="username">Username</Label>
                <Input
                    id="username"
                    type="text"
                    placeholder="John Doe"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                />
                </div>
                <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                    id="email"
                    type="email"
                    placeholder="m@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
                </div>
                <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                </div>
                <div className="grid gap-2">
                <Label>Role</Label>
                <RadioGroup
                    value={role}
                    onValueChange={(value) => setRole(value as 'admin' | 'joinee' | 'developer')}
                    className="flex gap-4"
                >
                    <div className="flex items-center space-x-2">
                    <RadioGroupItem value="joinee" id="joinee" />
                    <Label htmlFor="joinee">Joinee</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                    <RadioGroupItem value="admin" id="admin" />
                    <Label htmlFor="admin">Admin</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                    <RadioGroupItem value="developer" id="developer" />
                    <Label htmlFor="developer">Developer</Label>
                    </div>
                </RadioGroup>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign Up with Email
                </Button>
            </form>
        </CardContent>
        <CardFooter className="flex justify-center">
            <p className="text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link href="/login" className="text-primary hover:underline">
                    Login
                </Link>
            </p>
        </CardFooter>
      </Card>
    </div>
  );
}
