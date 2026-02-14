import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-4xl font-bold">SeplorX</h1>
      <p className="text-muted-foreground text-lg">Shipping portal project setup complete.</p>
      <div className="flex gap-2">
        <Button>Get Started</Button>
        <Button variant="outline">Learn More</Button>
      </div>
    </div>
  );
}
