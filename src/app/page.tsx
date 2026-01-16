
"use client";

import { useState, type FC, useEffect, useMemo } from "react";
import { useRouter } from 'next/navigation';
import {
  Loader2,
  PlusCircle,
  LogIn,
  LogOut,
  Trash2,
  ChevronRight,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useUser, useAuth, useFirestore, useMemoFirebase, setDocumentNonBlocking, deleteDocumentNonBlocking, useCollection } from "@/firebase";
import { signOut } from "firebase/auth";
import { useToast } from "@/hooks/use-toast";
import { collection, doc, getDocs, query, where, serverTimestamp, setDoc, deleteDoc } from "firebase/firestore";
import { useDocument } from "@/hooks/use-document";
import { isSameDay, toDate } from "date-fns";

const VOTE_START_LIMIT = 3;

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

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export default function Home() {
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  
  const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userProfile, isLoading: isProfileLoading, exists: profileExists } = useDocument(userProfileRef);

  const adminRoomsQuery = useMemoFirebase(
    () => user && userProfile?.role === 'admin' 
        ? query(collection(firestore, 'voting_rooms'), where('ownerId', '==', user.uid)) 
        : null,
    [firestore, user, userProfile]
  );
  const { data: adminRooms, isLoading: areAdminRoomsLoading } = useCollection(adminRoomsQuery);

  const dailyVoteStartCount = useMemo(() => {
    if (isProfileLoading || !userProfile || userProfile.role !== 'admin') return 0;
    const lastVoteDate = userProfile.lastVoteTimestamp ? toDate(userProfile.lastVoteTimestamp.seconds * 1000) : null;
    if (lastVoteDate && isSameDay(new Date(), lastVoteDate)) {
        return userProfile.dailyVoteCount || 0;
    }
    return 0; // Reset if it's a new day
  }, [userProfile, isProfileLoading]);

  const hasExceededVoteStartLimit = dailyVoteStartCount >= VOTE_START_LIMIT;

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [isUserLoading, user, router]);

  useEffect(() => {
    if (user && !isProfileLoading && profileExists === false) {
      const userData = {
        id: user.uid,
        email: user.email,
        username: user.displayName || 'Guest User',
        role: user.isAnonymous ? 'joinee' : (userProfile?.role || 'joinee'),
        dailyVoteCount: 0,
        lastVoteTimestamp: serverTimestamp(),
      };
      setDocumentNonBlocking(userProfileRef!, userData, { merge: true });
    }
  }, [user, isProfileLoading, profileExists, userProfileRef, userProfile?.role]);


  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  const handleCreateRoom = async () => {
    setIsCreatingRoom(true);
    if (!user || !userProfileRef) {
        toast({
            variant: "destructive",
            title: "Not Authenticated",
            description: "You must be logged in to create a room.",
        });
        setIsCreatingRoom(false);
        return;
    }

    if (hasExceededVoteStartLimit) {
        toast({
            variant: "destructive",
            title: "Vote Start Limit Reached",
            description: `You have used all your ${VOTE_START_LIMIT} free vote starts for today.`,
        });
        setIsCreatingRoom(false);
        return;
    }

    try {
      const newRoomCode = generateRoomCode();
      const newRoomRef = doc(collection(firestore, "voting_rooms"));
      
      const roomData = {
        id: newRoomRef.id,
        name: "New Voting Room",
        description: "Vote on the next topic.",
        ownerId: user.uid,
        code: newRoomCode,
        createdAt: serverTimestamp(),
        isVotingOpen: true,
        topic: 'Undecided',
        lectureTime: 'Not set'
      };

      await setDoc(newRoomRef, roomData);
      
      const newVoteCount = dailyVoteStartCount + 1;
      setDocumentNonBlocking(userProfileRef, {
        dailyVoteCount: newVoteCount,
        lastVoteTimestamp: serverTimestamp()
      }, { merge: true });


      toast({
        title: "Room Created!",
        description: `Your new room code is ${newRoomCode}. You have ${VOTE_START_LIMIT - newVoteCount} vote starts left today.`,
      });
      router.push(`/room/${newRoomRef.id}`);
    } catch (error: any) {
        console.error("Failed to create room:", error);
        toast({
            variant: "destructive",
            title: "Room Creation Failed",
            description: error.message || "An unexpected error occurred.",
        });
    } finally {
        setIsCreatingRoom(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) {
        toast({
            variant: "destructive",
            title: "Invalid Code",
            description: "Please enter a room code.",
        });
        return;
    }
    
    setIsJoiningRoom(true);
    try {
        const roomsRef = collection(firestore, 'voting_rooms');
        const q = query(roomsRef, where("code", "==", roomCode.trim().toUpperCase()));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            toast({
                variant: "destructive",
                title: "Room Not Found",
                description: "No room found with that code. Please check the code and try again.",
            });
        } else {
            const roomDoc = querySnapshot.docs[0];
            router.push(`/room/${roomDoc.id}`);
        }
    } catch (error: any) {
        console.error("Failed to join room:", error);
        toast({
            variant: "destructive",
            title: "Join Room Failed",
            description: error.message || "An unexpected error occurred.",
        });
    } finally {
      setIsJoiningRoom(false);
    }
  };

  const handleDeleteRoom = (roomId: string) => {
    const roomRef = doc(firestore, 'voting_rooms', roomId);
    deleteDocumentNonBlocking(roomRef);
    toast({
        title: "Room Deleted",
        description: "The voting room has been successfully deleted.",
    })
  };
  
  const handleGetMoreVotes = () => {
    if (!userProfileRef) return;
    setDocumentNonBlocking(userProfileRef, { dailyVoteCount: 0 }, { merge: true });
    toast({
      title: 'Payment Successful!',
      description: `You have received ${VOTE_START_LIMIT} more vote starts.`,
    });
  };

  if (isUserLoading || isProfileLoading || !user) {
      return (
        <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      );
  }

  const userRole = userProfile?.role;
  const displayName = user.isAnonymous ? 'Guest' : (userProfile?.username || user.email);

  const renderDashboard = () => {
    switch (userRole) {
        case 'admin':
            return (
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Admin Dashboard</CardTitle>
                            <CardDescription>
                                {hasExceededVoteStartLimit 
                                    ? `You've used all your free vote starts for today.`
                                    : `Create a new voting room for your class. You have ${VOTE_START_LIMIT - dailyVoteStartCount} free vote starts left today.`
                                }
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Starting a new vote session (by creating a room or resetting one) counts towards your daily limit.
                            </p>
                        </CardContent>
                        <CardFooter className="flex-col gap-4">
                            {!hasExceededVoteStartLimit ? (
                                <Button onClick={handleCreateRoom} disabled={isCreatingRoom || hasExceededVoteStartLimit} className="w-full">
                                    {isCreatingRoom ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                                    Create New Room
                                </Button>
                            ) : (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                         <Button className="w-full">
                                            <Wallet className="mr-2" /> Buy 3 More Vote Starts (₹20)
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Confirm Purchase</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This is a simulated payment. Clicking "Confirm" will reset your daily vote start count and grant you 3 more for today.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleGetMoreVotes}>
                                                Confirm
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                        </CardFooter>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Your Rooms</CardTitle>
                            <CardDescription>Manage your existing voting rooms.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {areAdminRoomsLoading && <div className="flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
                            {!areAdminRoomsLoading && (!adminRooms || adminRooms.length === 0) && (
                                <p className="text-sm text-muted-foreground text-center py-4">You haven't created any rooms yet.</p>
                            )}
                            {adminRooms && adminRooms.length > 0 && (
                                <ul className="space-y-2">
                                    {adminRooms.map(room => (
                                        <li key={room.id} className="flex items-center justify-between rounded-md border p-3">
                                            <div className="flex flex-col">
                                               <Link href={`/room/${room.id}`} className="font-semibold hover:underline">
                                                    {room.name}
                                                </Link>
                                                <span className="text-sm text-muted-foreground">Code: <span className="font-mono">{room.code}</span></span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This action cannot be undone. This will permanently delete the room and all its associated votes.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleDeleteRoom(room.id)}>
                                                                Delete
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                                <Link href={`/room/${room.id}`}>
                                                  <Button variant="outline" size="icon">
                                                      <ChevronRight className="h-4 w-4" />
                                                  </Button>
                                                </Link>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                </div>
            );
        case 'developer':
            return (
                 <Card>
                    <CardHeader>
                        <CardTitle>Developer Dashboard</CardTitle>
                        <CardDescription>System statistics and management tools.</CardDescription>
                    </CardHeader>
                    <CardContent>
                       <p className="text-sm text-muted-foreground">
                            Developer tools and system analytics will be available here.
                        </p>
                    </CardContent>
                </Card>
            );
        case 'joinee':
        default:
            return (
                 <Card>
                    <CardHeader>
                        <CardTitle>Join a Voting Room</CardTitle>
                        <CardDescription>Enter the unique code to join a room.</CardDescription>
                    </CardHeader>
                    <form onSubmit={handleJoinRoom}>
                        <CardContent>
                            <Input
                                value={roomCode}
                                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                                placeholder="ENTER ROOM CODE"
                                className="text-center text-lg tracking-widest font-mono"
                                maxLength={6}
                            />
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" className="w-full" disabled={isJoiningRoom}>
                                {isJoiningRoom ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
                                Join Room
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            );
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm md:px-8">
        <a href="/" className="flex items-center gap-2 font-semibold">
          <AppLogo className="h-6 w-6 text-primary" />
          <span className="text-xl">AgoraVote</span>
        </a>
        <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">
                Welcome, {displayName} ({userRole || '...'})
            </span>
            <Button variant="outline" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
            </Button>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center p-4 md:p-8">
        <div className="mx-auto w-full max-w-md">
            {profileExists === false && !isProfileLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /> : renderDashboard()}
        </div>
      </main>
    </div>
  );
}
