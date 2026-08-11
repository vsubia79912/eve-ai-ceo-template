import { defineSandbox } from "eve/sandbox";
import { vercel } from "eve/sandbox/vercel";

export default defineSandbox({
  backend: () =>
    vercel({
      networkPolicy: {
        allow: [
          "ai-gateway.vercel.sh",
          "github.com",
          "api.github.com",
          "objects.githubusercontent.com",
          "raw.githubusercontent.com",
          "registry.npmjs.org",
          "*.npmjs.org",
          "*.npmjs.com",
          "*.githubusercontent.com",
        ],
        subnets: {
          deny: [
            "10.0.0.0/8",
            "100.64.0.0/10",
            "127.0.0.0/8",
            "169.254.0.0/16",
            "172.16.0.0/12",
            "192.168.0.0/16",
          ],
        },
      },
      resources: { vcpus: 4 },
    }),
  description: "Persistent isolated coding environment; no production credentials or deployment access.",
  revalidationKey: () => "codex-worker-v1",
  async bootstrap(input) {
    const sandbox = await input.use();
    const install = await sandbox.run({
      command: "npm install --global @openai/codex@latest",
      workingDirectory: "/workspace",
    });
    if (install.exitCode !== 0) throw new Error(`Codex installation failed: ${install.stderr}`);
    await sandbox.run({ command: "mkdir -p /workspace/.company/codex", workingDirectory: "/workspace" });
  },
});
