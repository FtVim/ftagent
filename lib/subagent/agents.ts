import * as fs from "node:fs";
import * as path from "node:path";
import { CONFIG_DIR_NAME, getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";

export type AgentScope = "user" | "project" | "both";

export interface AgentConfig {
    name: string;
    description: string;
    tools?: string[];
    model?: string;
    system_prompt: string;
    source: "user" | "project";
    file_path: string;
}

type AgentFrontmatter = {
    name?: unknown;
    description?: unknown;
    tools?: unknown;
    model?: unknown;
};

function parse_tool_list(value: unknown): string[] | undefined {
    const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
    const tools = values
        .filter((tool): tool is string => typeof tool === "string")
        .map((tool) => tool.trim())
        .filter((tool) => tool.length > 0);
    return tools.length > 0 ? tools : undefined;
}

function load_agents(directory: string, source: AgentConfig["source"]): AgentConfig[] {
    if (!fs.existsSync(directory)) {
        return [];
    }

    return fs.readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.name.endsWith(".md") && (entry.isFile() || entry.isSymbolicLink()))
        .flatMap((entry) => {
            const file_path = path.join(directory, entry.name);
            const content = fs.readFileSync(file_path, "utf8");
            const { frontmatter, body } = parseFrontmatter<AgentFrontmatter>(content);
            if (
                typeof frontmatter.name !== "string" ||
                typeof frontmatter.description !== "string"
            ) {
                return [];
            }

            return [{
                name: frontmatter.name,
                description: frontmatter.description,
                tools: parse_tool_list(frontmatter.tools),
                model: typeof frontmatter.model === "string" ? frontmatter.model : undefined,
                system_prompt: body,
                source,
                file_path,
            }];
        });
}

function find_project_agents_dir(cwd: string): string | undefined {
    let current_dir = cwd;
    while (true) {
        const candidate = path.join(current_dir, CONFIG_DIR_NAME, "agents");
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
            return candidate;
        }

        const parent_dir = path.dirname(current_dir);
        if (parent_dir === current_dir) {
            return undefined;
        }
        current_dir = parent_dir;
    }
}

export function discover_agents(
    cwd: string,
    scope: AgentScope,
): { agents: AgentConfig[]; project_agents_dir?: string } {
    const user_agents = scope === "project"
        ? []
        : load_agents(path.join(getAgentDir(), "agents"), "user");
    const project_agents_dir = scope === "user" ? undefined : find_project_agents_dir(cwd);
    const project_agents = project_agents_dir ? load_agents(project_agents_dir, "project") : [];
    const agents = new Map<string, AgentConfig>();

    for (const agent of user_agents) {
        agents.set(agent.name, agent);
    }
    for (const agent of project_agents) {
        agents.set(agent.name, agent);
    }

    return { agents: Array.from(agents.values()), project_agents_dir };
}
