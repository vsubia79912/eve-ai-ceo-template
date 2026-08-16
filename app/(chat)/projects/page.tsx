import { ProjectsManager } from "@/app/_components/projects-manager";

export default function ProjectsPage() {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-16 pb-10 sm:px-6 md:pt-10">
      <div className="mx-auto w-full max-w-4xl">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Projects are optional folders for chats, instructions, and defaults. A project does not need a GitHub repository.
        </p>
        <div className="mt-8">
          <ProjectsManager />
        </div>
      </div>
    </main>
  );
}
