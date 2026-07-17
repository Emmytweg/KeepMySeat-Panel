"use client";

import { useState, useEffect } from "react";
import { useKeepMySeat } from "@/hooks/useKeepMySeat";
import {
  Lock,
  Unlock,
  ShieldAlert,
  CheckCircle,
  Terminal,
  Users,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { supabase } from "@/config/supabase";

const DEMO_TASKS = [
  {
    id: "demo-1",
    title: "Claim a build lane",
    category: "coordination",
    description:
      "Set up your first seat so the team can start the hackathon sprint.",
    size_class: "md:col-span-2",
  },
  {
    id: "demo-2",
    title: "Sync Monad contract",
    category: "on-chain",
    description:
      "Wire the seat-locking transaction to your wallet and test the flow.",
    size_class: "",
  },
  {
    id: "demo-3",
    title: "Monitor live updates",
    category: "realtime",
    description: "Watch Supabase changes and keep the dashboard in sync.",
    size_class: "md:col-span-2",
  },
];

export default function Dashboard() {
  const { lockTask, getTaskStatus, loading } = useKeepMySeat();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskStates, setTaskStates] = useState<Record<string, any>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Modal & Form States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("Frontend");
  const [newDescription, setNewDescription] = useState("");
  const [newSize, setNewSize] = useState("");

  const normalizeAddress = (value: unknown) => {
    if (typeof value === "string") return value;

    if (value && typeof value === "object") {
      if (
        "lockedBy" in value &&
        typeof (value as { lockedBy?: unknown }).lockedBy === "string"
      ) {
        return (value as { lockedBy: string }).lockedBy;
      }

      if (
        0 in (value as Record<number, unknown>) &&
        typeof (value as Record<number, unknown>)[0] === "string"
      ) {
        return (value as Record<number, string>)[0];
      }
    }

    return null;
  };

  // Connect wallet handler
  const connectWallet = async () => {
    if (typeof window !== "undefined" && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        setWalletAddress(accounts[0]);
        setErrorMessage(null);
      } catch (err) {
        setErrorMessage("Wallet connection rejected.");
      }
    } else {
      setErrorMessage(
        "Please install a web3 wallet browser extension to participate.",
      );
    }
  };

  // Fetch initial tasks from Supabase and check their Monad contract status
  const initializeDashboard = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from("tasks").select("*");
      if (error) {
        setErrorMessage("Could not connect to database backend.");
        setTasks([]);
        setTaskStates({});
        return;
      }

      const fetchedTasks = data || [];
      setTasks(fetchedTasks);

      // Dynamically select which array to query states for
      const targetTasks = fetchedTasks.length === 0 ? DEMO_TASKS : fetchedTasks;

      // Query on-chain states
      const states: Record<string, any> = {};
      for (const task of targetTasks) {
        const status = await getTaskStatus(task.id);
        if (status) states[task.id] = status;
      }
      setTaskStates(states);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    initializeDashboard();

    const taskChannel: any = supabase.channel("live-tasks");

    taskChannel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tasks" },
      async (payload: { new: { id?: string } | null }) => {
        const { data } = await supabase.from("tasks").select("*");
        const freshTasks = data || [];
        setTasks(freshTasks);

        if (payload.new && "id" in payload.new) {
          const updatedRow = payload.new as { id: string; [key: string]: any };
          const status = await getTaskStatus(updatedRow.id);
          setTaskStates((prev) => ({ ...prev, [updatedRow.id]: status }));
        }
      },
    );

    taskChannel.subscribe();

    return () => {
      supabase.removeChannel(taskChannel);
    };
  }, []);

  const handleLockClick = async (taskId: string, isLocked: boolean) => {
    if (isLocked) {
      setErrorMessage("This seat is already locked and cannot be changed.");
      return;
    }

    if (!walletAddress) {
      setErrorMessage("Connect your developer wallet first.");
      return;
    }
    setErrorMessage(null);
    try {
      await lockTask(taskId, walletAddress as `0x${string}`);
      const updatedStatus = await getTaskStatus(taskId);
      setTaskStates((prev) => ({ ...prev, [taskId]: updatedStatus }));
    } catch (err: any) {
      setErrorMessage(err.message || "Transaction failed.");
    }
  };

  // Handle saving new tasks directly into Supabase
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDescription.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const generatedId = `task_${Date.now()}`;

    try {
      const { error } = await supabase.from("tasks").insert([
        {
          id: generatedId,
          title: newTitle,
          category: newCategory,
          description: newDescription,
          size_class: newSize,
        },
      ]);

      if (error) throw error;

      // Reset form options
      setNewTitle("");
      setNewDescription("");
      setNewSize("");
      setIsModalOpen(false);

      // Update chain tracking context instantly for the new id entry
      const status = await getTaskStatus(generatedId);
      if (status) {
        setTaskStates((prev) => ({ ...prev, [generatedId]: status }));
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Could not save row to database.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Determine actual display array configuration
  const isDemoMode = !isLoading && tasks.length === 0;
  const visibleTasks = isDemoMode ? DEMO_TASKS : tasks;

  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-12 font-sans selection:bg-purple-500 selection:text-black relative">
      {/* Top Navigation Frame */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-12 pb-6 border-b border-neutral-800">
        <div>
          <div className="flex items-center gap-2 text-purple-400 font-mono text-sm mb-1">
            <Terminal size={14} /> MONAD SPARK HACKATHON
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            KeepMySeat Panel
          </h1>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 rounded-xl font-medium text-sm border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-900 text-neutral-200 transition-all flex items-center gap-2 active:scale-95"
          >
            <Plus size={16} /> Add Task
          </button>

          <button
            onClick={connectWallet}
            className={`px-5 py-2.5 rounded-xl font-medium tracking-wide transition-all duration-300 active:scale-95 flex items-center gap-2 ${
              walletAddress
                ? "bg-neutral-900 border border-neutral-700 text-purple-400 font-mono text-xs"
                : "bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20"
            }`}
          >
            <Users size={16} />
            {walletAddress
              ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
              : "Connect Team Wallet"}
          </button>
        </div>
      </header>

      {/* Error Toast Notification */}
      {errorMessage && (
        <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-400 flex items-center gap-3 text-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <ShieldAlert size={18} className="shrink-0" />
          <p>{errorMessage}</p>
        </div>
      )}

      {/* Main UI Body Grid Renderer */}
      {isLoading ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-12 text-center text-neutral-400 flex flex-col items-center justify-center gap-3 min-h-75">
          <Loader2 className="animate-spin text-purple-500" size={24} />
          <p className="text-sm font-mono tracking-wide text-neutral-500">
            LOADING MOCK LANES FROM DATABASE ENGINE...
          </p>
        </div>
      ) : (
        <>
          {/* Banner notification verifying local demo context */}
          {isDemoMode && (
            <div className="mb-6 p-3 rounded-xl bg-purple-950/10 border border-purple-900/40 text-purple-300 text-xs flex items-center justify-between">
              <span>
                💡 Currently showing local placeholder tasks. Click{" "}
                <strong>Add Task</strong> above to initialize your direct
                database records!
              </span>
            </div>
          )}

          {/* Dynamic Bento Grid Mapping */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-55">
            {visibleTasks.map((task) => {
              const state = taskStates[task.id];
              const isLocked = state?.isLocked;
              const lockHolder = normalizeAddress(state?.lockedBy);
              const isUserOwner =
                walletAddress &&
                lockHolder?.toLowerCase() === walletAddress.toLowerCase();

              return (
                <div
                  key={task.id}
                  className={`rounded-2xl p-6 border transition-all duration-500 flex flex-col justify-between group ${
                    task.size_class || ""
                  } ${
                    isLocked
                      ? isUserOwner
                        ? "bg-purple-950/20 border-purple-500/60 shadow-inner"
                        : "bg-neutral-950 border-neutral-800 opacity-75"
                      : "bg-neutral-900/40 border-neutral-800/80 hover:border-neutral-700 hover:bg-neutral-900/70"
                  }`}
                >
                  {/* Card Header Elements */}
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <span className="text-[10px] font-mono tracking-widest uppercase text-neutral-500 block mb-1">
                        {task.category}
                      </span>
                      <h3 className="text-lg font-bold tracking-tight text-neutral-100 group-hover:text-white transition-colors">
                        {task.title}
                      </h3>
                    </div>

                    {/* Visual Status Badges */}
                    <div className="shrink-0 mt-1">
                      {isLocked ? (
                        isUserOwner ? (
                          <span className="p-2 bg-purple-500/10 text-purple-400 rounded-lg block">
                            <CheckCircle size={16} />
                          </span>
                        ) : (
                          <span className="p-2 bg-neutral-800 text-neutral-500 rounded-lg block">
                            <Lock size={16} />
                          </span>
                        )
                      ) : (
                        <span className="p-2 bg-neutral-900 border border-neutral-800 text-neutral-400 rounded-lg block group-hover:text-purple-400 group-hover:border-purple-950 transition-colors">
                          <Unlock size={16} />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Body Description */}
                  <p className="text-xs text-neutral-400 leading-relaxed max-w-sm line-clamp-2 my-2">
                    {task.description}
                  </p>

                  {/* Card Footer Interaction Action Row */}
                  <div className="flex items-center justify-between pt-3 border-t border-neutral-800/60 mt-auto">
                    <div className="text-[10px] font-mono text-neutral-500">
                      {isLocked && lockHolder ? (
                        <span className="text-neutral-400">
                          Seat: {lockHolder.slice(0, 4)}...
                          {lockHolder.slice(-4)}
                        </span>
                      ) : (
                        "Status: Open for Build"
                      )}
                    </div>

                    <button
                      onClick={() =>
                        handleLockClick(task.id, Boolean(isLocked))
                      }
                      disabled={loading || isLocked || isDemoMode}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                        isLocked
                          ? "bg-neutral-950 border border-neutral-900 text-neutral-600 cursor-not-allowed"
                          : "bg-white hover:bg-neutral-200 text-black active:scale-95 disabled:opacity-50"
                      }`}
                    >
                      {loading ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : isLocked ? (
                        "Locked"
                      ) : (
                        "Take Seat"
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Task Creation Modal Backdrop Overlay Frame */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 r-4 text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors"
              style={{ right: "1.5rem" }}
            >
              <X size={18} />
            </button>

            <h2 className="text-xl font-bold tracking-tight mb-1 text-white">
              Create New Task Block
            </h2>
            <p className="text-xs text-neutral-400 mb-6">
              Publish a fresh development task directly onto the global
              dashboard.
            </p>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-[11px] font-mono tracking-wide text-neutral-400 uppercase mb-1.5">
                  Task Title
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g., Integrate Supabase Realtime Channels"
                  className="w-full bg-black border border-neutral-800 rounded-xl px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-1 focus:ring-purple-500/70 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono tracking-wide text-neutral-400 uppercase mb-1.5">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-black border border-neutral-800 rounded-xl px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-1 focus:ring-purple-500/70 transition-colors"
                  >
                    <option value="Frontend">Frontend</option>
                    <option value="Backend">Backend</option>
                    <option value="Smart Contract">Smart Contract</option>
                    <option value="UI/UX">UI/UX</option>
                    <option value="DevOps">DevOps</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-mono tracking-wide text-neutral-400 uppercase mb-1.5">
                    Grid Dimensions
                  </label>
                  <select
                    value={newSize}
                    onChange={(e) => setNewSize(e.target.value)}
                    className="w-full bg-black border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-purple-500/70 transition-colors"
                  >
                    <option value="">Standard Slot (1x1)</option>
                    <option value="md:col-span-2">Wide Block (2x1)</option>
                    <option value="md:col-span-1 md:row-span-2">
                      Tall Block (1x2)
                    </option>
                    <option value="md:col-span-2 md:row-span-2">
                      Mega Block (2x2)
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono tracking-wide text-neutral-400 uppercase mb-1.5">
                  Description
                </label>
                <textarea
                  required
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Summarize the scope of this development milestone..."
                  className="w-full bg-black border border-neutral-800 rounded-xl p-3 text-sm text-neutral-200 focus:outline-none focus:ring-1 focus:ring-purple-500/70 transition-colors resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800/40 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-sm font-medium rounded-xl bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Saving...
                    </>
                  ) : (
                    "Publish Task"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
