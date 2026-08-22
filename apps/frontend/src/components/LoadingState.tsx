import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  message?: string;
}

export default function LoadingState({ message = "Loading..." }: LoadingStateProps) {
  return (
    <div className="flex items-center justify-center p-12">
      <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      <span className="ml-2 text-sm text-slate-500">{message}</span>
    </div>
  );
}
