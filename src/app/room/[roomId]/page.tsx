
"use client";

import { useState, useMemo, type FC, useEffect } from "react";
import { useParams, useRouter } from 'next/navigation';
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import {
  BrainCircuit,
  Loader2,
  Vote,
  LogOut,
  Home,
  Copy,
  Users,
  CheckCircle,
  XCircle,
  Edit,
  Trophy,
  Trash2,
  Megaphone,
  RefreshCw,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { predictVotingOutcome } from "@/ai/flows/predict-voting-outcome";
import type { PredictVotingOutcomeOutput } from "@/ai/flows/predict-voting-outcome";
import { useToast } from "@/hooks/use-toast";
import { useUser, useAuth, useFirestore, useCollection, useMemoFirebase, updateDocumentNonBlocking, setDocumentNonBlocking, deleteDocumentNonBlocking } from "@/firebase";
import { signOut } from "firebase/auth";
import { collection, query, doc, addDoc, serverTimestamp, writeBatch, getDocs, updateDoc } from "firebase/firestore";
import { useDocument } from "@/hooks/use-document";
import confetti from "canvas-confetti";
import { toDate, isSameDay } from "date-fns";

type VotingOption = {
  name: string;
  color: string;
};

const VOTE_START_LIMIT = 3;

const votingOptionsConfig: VotingOption[] = [
  { name: "Attend Class", color: "hsl(var(--chart-1))" },
  { name: "Bunk Class", color: "hsl(var(--chart-2))" },
];

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

export default function RoomPage() {
  const [prediction, setPrediction] = useState<PredictVotingOutcomeOutput | null>(null);
  const [isPredicting, setIsPredicting] = useState(false);
  const [topic, setTopic] = useState('');
  const [lectureTime, setLectureTime] = useState('');
  const [showWinnerDialog, setShowWinnerDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const params = useParams();
  const roomId = params.roomId as string;

  const roomRef = useMemoFirebase(() => (roomId && user) ? doc(firestore, 'voting_rooms', roomId) : null, [firestore, roomId, user]);
  const { data: roomData, isLoading: isRoomLoading, exists: roomExists } = useDocument(roomRef);

  const votesQuery = useMemoFirebase(() => (roomId && user) ? query(collection(firestore, `voting_rooms/${roomId}/votes`)) : null, [firestore, roomId, user]);
  const { data: votes, isLoading: areVotesLoading } = useCollection(votesQuery);
  
  const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userProfile, isLoading: isProfileLoading, exists: profileExists } = useDocument(userProfileRef);

  const userVoteRef = useMemoFirebase(() => (roomId && user) ? doc(firestore, `voting_rooms/${roomId}/votes`, user.uid) : null, [firestore, roomId, user]);
  const { data: userVote, isLoading: isUserVoteLoading } = useDocument(userVoteRef);

  const hasVoted = !!userVote;
  const isAdmin = roomExists && profileExists && roomData?.ownerId === user?.uid && userProfile?.role === 'admin';

  const dailyVoteStartCount = useMemo(() => {
    if (!isAdmin || isProfileLoading || !userProfile) return 0;
    const lastVoteDate = userProfile.lastVoteTimestamp ? toDate(userProfile.lastVoteTimestamp.seconds * 1000) : null;
    if (lastVoteDate && isSameDay(new Date(), lastVoteDate)) {
        return userProfile.dailyVoteCount || 0;
    }
    return 0; // Reset if it's a new day
  }, [isAdmin, userProfile, isProfileLoading]);

  const hasExceededVoteStartLimit = dailyVoteStartCount >= VOTE_START_LIMIT;


  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (roomData) {
      setTopic(roomData.topic || 'Undecided');
      setLectureTime(roomData.lectureTime || 'Not set');

      if(roomData.winnerAnnounced && roomData.winnerOption && !isAdmin) {
        setShowWinnerDialog(true);
      }
    }
  }, [roomData, isAdmin]);

  useEffect(() => {
    if (showWinnerDialog) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [showWinnerDialog]);

  const handleVote = async (optionName: string) => {
    if (!user || !roomId) return;
    if (hasVoted) {
        toast({ variant: 'destructive', title: 'Already Voted', description: 'You have already voted in this session.' });
        return;
    }
    if (!roomData?.isVotingOpen) {
      toast({ variant: "destructive", title: "Voting Closed", description: "The admin has closed voting for this room." });
      return;
    }
    
    const voteDocRef = doc(firestore, `voting_rooms/${roomId}/votes`, user.uid);
    const voteData = {
        id: user.uid,
        roomId: roomId,
        voterId: user.uid,
        voteOption: optionName,
        timestamp: serverTimestamp(),
    };

    setDocumentNonBlocking(voteDocRef, voteData, {});
    toast({ title: 'Vote Cast!', description: `You voted for: ${optionName}.` });
  };
  
  const handleGetMoreVotes = () => {
    if (!userProfileRef) return;
    setDocumentNonBlocking(userProfileRef, { dailyVoteCount: 0 }, { merge: true });
    toast({
      title: 'Payment Successful!',
      description: `You have received ${VOTE_START_LIMIT} more vote starts. Happy voting!`,
    });
  };

  const handlePredict = async () => {
    setIsPredicting(true);
    setPrediction(null);
    try {
      const votingDataString = chartData
        .map((opt) => `${opt.name}: ${opt.votes} votes`)
        .join(", ");
      const fullPrompt = `Current voting data for class attendance: ${votingDataString}. Historical trend: The "Attend Class" option usually has more votes, but "Bunk Class" can gain momentum on Fridays. Predict the final probability for each option.`;

      const result = await predictVotingOutcome({ votingData: fullPrompt });
      setPrediction(result);
    } catch (error) {
      console.error("AI prediction failed:", error);
      toast({
        variant: "destructive",
        title: "Prediction Error",
        description: "The AI failed to generate a prediction. Please try again.",
      });
    } finally {
      setIsPredicting(false);
    }
  };
  
  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  const toggleVotingStatus = () => {
    if (roomRef && roomData) {
        const updateData = { isVotingOpen: !roomData.isVotingOpen, winnerAnnounced: false, winnerOption: null };
        updateDocumentNonBlocking(roomRef, updateData);
        toast({ title: `Voting ${!roomData.isVotingOpen ? 'Opened' : 'Closed'}`});
    }
  }

  const handleUpdateRoomDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomRef) {
        updateDocumentNonBlocking(roomRef, { topic, lectureTime });
        toast({ title: "Room Details Updated" });
    }
  }
  
  const handleAnnounceResult = () => {
    if (!roomRef || !votes) return;

    const winner = chartData.reduce((prev, current) => (prev.votes > current.votes) ? prev : current);

    if (winner.votes > 0) {
      updateDocumentNonBlocking(roomRef, { winnerAnnounced: true, winnerOption: winner.name });
      toast({ title: "Result Announced!", description: `The winner is "${winner.name}"` });
      confetti({
        particleCount: 150,
        spread: 90,
        origin: { y: 0.6 },
      });
    } else {
      toast({ variant: "destructive", title: "No Votes Cast", description: "Cannot announce a result with zero votes." });
    }
  };

  const handleResetVoting = async () => {
    if (!roomId || !user || !userProfileRef) return;
    setIsResetting(true);

    if (hasExceededVoteStartLimit) {
        toast({ variant: "destructive", title: "Vote Start Limit Reached", description: "Please purchase more vote starts to reset the session." });
        setIsResetting(false);
        return;
    }
    
    try {
        const currentVotesQuery = query(collection(firestore, `voting_rooms/${roomId}/votes`));
        const batch = writeBatch(firestore);
        const votesSnapshot = await getDocs(currentVotesQuery);

        if (votesSnapshot.empty) {
            toast({ title: "Nothing to Reset", description: "There are no votes to archive." });
        } else {
            votesSnapshot.forEach(voteDoc => {
                const archiveRef = doc(firestore, `voting_rooms/${roomId}/archived_votes`, voteDoc.id);
                batch.set(archiveRef, voteDoc.data());
                batch.delete(voteDoc.ref);
            });
        }
        
        const newVoteCount = dailyVoteStartCount + 1;
        batch.update(userProfileRef, {
            dailyVoteCount: newVoteCount,
            lastVoteTimestamp: serverTimestamp()
        });

        await batch.commit();

        toast({ title: "Voting Reset", description: `Session has been reset. You have ${VOTE_START_LIMIT - newVoteCount} vote starts left today.` });
    } catch (error: any) {
        console.error("Failed to reset voting:", error);
        toast({ variant: "destructive", title: "Reset Failed", description: error.message || "An unexpected error occurred." });
    } finally {
        setIsResetting(false);
    }
  };

  const handleRemoveParticipant = (voteId: string) => {
    if (!roomId || !voteId) return;
    const voteRef = doc(firestore, `voting_rooms/${roomId}/votes`, voteId);
    deleteDocumentNonBlocking(voteRef);
    toast({ title: "Participant Removed", description: "The participant's vote has been deleted." });
  };

  const chartData = useMemo(() => {
    return votingOptionsConfig.map(option => {
        const voteCount = votes?.filter(v => v.voteOption === option.name).length || 0;
        return {
            name: option.name,
            votes: voteCount,
            fill: option.color,
        }
    });
  }, [votes]);

  const lineChartData = useMemo(() => {
    if (!votes) return [];
    
    const sortedVotes = [...votes].sort((a, b) => 
        (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0)
    );

    let attendCount = 0;
    let bunkCount = 0;

    return sortedVotes.map(vote => {
        if (vote.voteOption === 'Attend Class') attendCount++;
        if (vote.voteOption === 'Bunk Class') bunkCount++;

        return {
            time: toDate(vote.timestamp?.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            'Attend Class': attendCount,
            'Bunk Class': bunkCount,
        };
    });
}, [votes]);

  const totalVotes = useMemo(() => chartData.reduce((acc, curr) => acc + curr.votes, 0), [chartData]);
  
  const predictionChartData = useMemo(() => {
    return prediction?.predictions.map(p => ({
        name: p.option,
        probability: Math.round(p.probability),
        fill: votingOptionsConfig.find(opt => opt.name === p.option)?.color || '#ccc'
    })) || [];
  }, [prediction]);


  const copyRoomCode = () => {
    if (roomData?.code) {
        navigator.clipboard.writeText(roomData.code);
        toast({ title: 'Copied!', description: 'Room code copied to clipboard.'});
    }
  }
  
  const isLoading = isUserLoading || isRoomLoading || areVotesLoading || isUserVoteLoading || isProfileLoading;

  if (isLoading) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading Room...</p>
      </div>
    );
  }
  
  if (!user || !profileExists) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Verifying user...</p>
      </div>
    );
  }
  
   if (!roomExists) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background">
        <XCircle className="h-12 w-12 text-destructive" />
        <h1 className="mt-4 text-2xl font-bold">Room Not Found</h1>
        <p className="text-muted-foreground">This room does not exist or you do not have permission to view it.</p>
        <Button onClick={() => router.push('/')} className="mt-6">
          <Home className="mr-2" />
          Go to Homepage
        </Button>
      </div>
    );
  }

  const JoineeVotingCard = () => (
    <Card>
        <CardHeader>
        <CardTitle>Cast Your Vote</CardTitle>
        <CardDescription>
            {hasVoted
                ? "You have already voted in this session."
                : "Your vote is anonymous and final."
            }
        </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
        {votingOptionsConfig.map((option) => (
            <Button
            key={option.name}
            variant="outline"
            className="h-auto w-full justify-start p-4 text-left"
            onClick={() => handleVote(option.name)}
            disabled={hasVoted || !roomData?.isVotingOpen}
            >
            <div className="flex w-full items-center justify-between">
                <span className="font-semibold">{option.name}</span>
                {userVote?.voteOption === option.name ? <CheckCircle className="h-5 w-5 text-green-500" /> : <Vote className="h-5 w-5 text-primary" /> }
            </div>
            </Button>
        ))}
        </CardContent>

        {hasVoted && (
          <CardFooter>
              <p className="text-sm text-green-500 font-medium">
                You voted for: {userVote?.voteOption}
              </p>
          </CardFooter>
        )}
        {!hasVoted && (
           <CardFooter>
            <p className="text-xs text-muted-foreground">
                This action is irreversible. Choose wisely.
            </p>
          </CardFooter>
        )}
    </Card>
  );

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
       <AlertDialog open={showWinnerDialog} onOpenChange={setShowWinnerDialog}>
          <AlertDialogContent className="text-center">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex flex-col items-center justify-center text-2xl">
                <Trophy className="h-16 w-16 text-yellow-400" />
                <span className="mt-4">The Verdict Is In!</span>
              </AlertDialogTitle>
              <AlertDialogDescription className="text-lg">
                The winning vote is to...
                <br />
                <strong className="text-xl text-primary">{roomData?.winnerOption}</strong>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="sm:justify-center">
              <AlertDialogAction>Got it</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm md:px-8">
        <a href="/" className="flex items-center gap-2 font-semibold">
          <AppLogo className="h-6 w-6 text-primary" />
          <span className="text-xl">AgoraVote</span>
        </a>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => router.push('/')}>
            <Home className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </header>
      <main className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {roomData?.name || 'Voting Room'}
            </h1>
            <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                Room Code: <span className="font-mono text-primary">{roomData?.code || '...'}</span>
                </span>
                <Button variant="ghost" size="icon" onClick={copyRoomCode} disabled={!roomData?.code}>
                    <Copy className="h-4 w-4" />
                </Button>
            </div>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                <p><strong>Topic:</strong> {roomData?.topic}</p>
                <p><strong>Lecture Time:</strong> {roomData?.lectureTime}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-8">
              <Card>
                <CardHeader>
                  <CardTitle>Live Results</CardTitle>
                  <CardDescription className="flex items-center">
                    <span>
                      Results are updated in real-time as votes are cast.
                    </span>
                    <Badge variant={roomData?.isVotingOpen ? "default" : "destructive"} className="ml-2">
                        {roomData?.isVotingOpen ? 'Voting Open' : 'Voting Closed'}
                    </Badge>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                        votes: { label: "Votes" },
                        "Attend Class": { label: "Attend Class", color: "hsl(var(--chart-1))" },
                        "Bunk Class": { label: "Bunk Class", color: "hsl(var(--chart-2))" },
                    }}
                    className="h-[250px] w-full"
                  >
                    <ResponsiveContainer>
                        <LineChart data={lineChartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                            <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <ChartLegend />
                            <Line type="monotone" dataKey="Attend Class" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="Bunk Class" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                   <div className="flex items-center justify-center space-x-6 mt-4 text-sm">
                        {chartData.map(item => (
                            <div key={item.name} className="flex items-center gap-2">
                                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.fill }} />
                                <span className="text-muted-foreground">{item.name}:</span>
                                <strong className="text-foreground">{item.votes}</strong>
                            </div>
                        ))}
                         <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Total:</span>
                            <strong className="text-foreground">{totalVotes}</strong>
                        </div>
                    </div>
                </CardContent>
                {isAdmin && (
                <>
                <Separator className="my-4" />
                <CardHeader>
                  <CardTitle>AI Prediction</CardTitle>
                  <CardDescription>
                    Forecast the final outcome based on current trends and historical data.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isPredicting && (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="ml-4 text-muted-foreground">
                        Analyzing trends and predicting outcome...
                      </p>
                    </div>
                  )}
                  {prediction && !isPredicting && (
                     <ChartContainer
                        config={{
                            probability: { label: "Probability" },
                            ...predictionChartData.reduce((acc, cur) => ({...acc, [cur.name]: {label: cur.name, color: cur.fill}}), {})
                        }}
                        className="mx-auto aspect-square h-[250px]"
                        >
                        <PieChart>
                          <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                          <Pie data={predictionChartData} dataKey="probability" nameKey="name" labelLine={false} label={({ percent }) => `${Math.round(percent * 100)}%`}>
                            {predictionChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Pie>
                          <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                        </PieChart>
                    </ChartContainer>
                  )}
                </CardContent>
                <CardFooter>
                  <Button
                    onClick={handlePredict}
                    disabled={isPredicting}
                    className="w-full"
                  >
                    {isPredicting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <BrainCircuit className="mr-2 h-4 w-4" />
                    )}
                    Predict Future Outcome
                  </Button>
                </CardFooter>
                </>
                )}
              </Card>
            </div>

            <div className="lg:col-span-1 space-y-8">
             {!isAdmin && <JoineeVotingCard />}

             {isAdmin && (
                <Card>
                    <CardHeader>
                        <CardTitle>Admin Controls</CardTitle>
                        <CardDescription>
                            {hasExceededVoteStartLimit 
                                ? `You've used all your free vote starts today.`
                                : `You have ${VOTE_START_LIMIT - dailyVoteStartCount} vote starts left today.`
                            }
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Button onClick={toggleVotingStatus} className="w-full">
                            {roomData?.isVotingOpen ? (
                                <><XCircle className="mr-2"/> End Voting</>
                            ) : (
                                <><CheckCircle className="mr-2"/> Start Voting</>
                            )}
                        </Button>
                         <Button onClick={handleAnnounceResult} className="w-full" variant="secondary" disabled={roomData?.isVotingOpen || (votes?.length === 0)}>
                           <Megaphone className="mr-2" /> Announce Result
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" className="w-full" disabled={isResetting || hasExceededVoteStartLimit}>
                                    {isResetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2" />}
                                    Reset Voting
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will archive all current votes and start a new session. This will use one of your daily vote starts.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleResetVoting}>
                                        Yes, Reset It
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        {hasExceededVoteStartLimit && (
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
                                            This is a simulated payment. Confirming will reset your daily vote start count.
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
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="outline" className="w-full"><Edit className="mr-2"/> Edit Details</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <form onSubmit={handleUpdateRoomDetails}>
                                    <DialogHeader>
                                        <DialogTitle>Edit Room Details</DialogTitle>
                                        <DialogDescription>
                                            Update the topic and lecture time for this room.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="topic" className="text-right">Topic</Label>
                                            <Input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="col-span-3" />
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="lectureTime" className="text-right">Lecture Time</Label>
                                            <Input id="lectureTime" value={lectureTime} onChange={(e) => setLectureTime(e.target.value)} className="col-span-3" />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <DialogClose asChild>
                                            <Button type="submit">Save Changes</Button>
                                        </DialogClose>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>

                    </CardContent>
                    <Separator />
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Users /> Participants ({votes?.length || 0})</CardTitle>
                    </CardHeader>
                    <CardContent className="max-h-60 overflow-y-auto">
                        <ul className="space-y-2">
                            {votes && votes.length > 0 ? (
                                votes.map(vote => (
                                    <li key={vote.id} className="flex items-center justify-between text-sm text-muted-foreground pr-2">
                                        <span>Voter ID: ...{vote.voterId.slice(-6)}</span>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Remove Participant?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will permanently delete this participant's vote. This action cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleRemoveParticipant(vote.id)}>
                                                        Remove
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </li>
                                ))
                            ) : (
                                <li className="text-sm text-muted-foreground">No participants have voted yet.</li>
                            )}
                        </ul>
                    </CardContent>
                </Card>
             )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
