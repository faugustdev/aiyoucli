//! Project technology detector.
//!
//! Scans project files to detect technologies, frameworks, and tools.
//! Returns detected technologies with recommended community skills.
//! Covers: JS/TS, Python, Rust, Kotlin, Go, Java, Ruby, Swift, PHP, and more.

use std::collections::HashSet;
use std::path::Path;

use serde_json::json;

// ── Technology definitions ───────────────────────────────────────

struct TechDef {
    id: &'static str,
    name: &'static str,
    category: &'static str,
    packages: &'static [&'static str],
    config_files: &'static [&'static str],
    file_extensions: &'static [&'static str],
    skills: &'static [&'static str],
}

const TECHS: &[TechDef] = &[
    // ── JavaScript/TypeScript Frontend ────────────────────
    TechDef {
        id: "react", name: "React", category: "frontend",
        packages: &["react", "react-dom"],
        config_files: &[],
        file_extensions: &[".jsx", ".tsx"],
        skills: &[
            "vercel-labs/agent-skills/vercel-react-best-practices",
            "vercel-labs/agent-skills/vercel-composition-patterns",
        ],
    },
    TechDef {
        id: "nextjs", name: "Next.js", category: "frontend",
        packages: &["next"],
        config_files: &["next.config.js", "next.config.mjs", "next.config.ts"],
        file_extensions: &[],
        skills: &[
            "vercel-labs/next-skills/next-best-practices",
            "vercel-labs/next-skills/next-cache-components",
        ],
    },
    TechDef {
        id: "vue", name: "Vue", category: "frontend",
        packages: &["vue"],
        config_files: &[],
        file_extensions: &[".vue"],
        skills: &[
            "hyf0/vue-skills/vue-best-practices",
            "antfu/skills/vue",
        ],
    },
    TechDef {
        id: "svelte", name: "Svelte", category: "frontend",
        packages: &["svelte", "@sveltejs/kit"],
        config_files: &["svelte.config.js"],
        file_extensions: &[".svelte"],
        skills: &[],
    },
    TechDef {
        id: "astro", name: "Astro", category: "frontend",
        packages: &["astro"],
        config_files: &["astro.config.mjs", "astro.config.js", "astro.config.ts"],
        file_extensions: &[".astro"],
        skills: &["astrolicious/agent-skills/astro"],
    },
    TechDef {
        id: "angular", name: "Angular", category: "frontend",
        packages: &["@angular/core"],
        config_files: &["angular.json"],
        file_extensions: &[],
        skills: &[],
    },
    TechDef {
        id: "tailwind", name: "Tailwind CSS", category: "styling",
        packages: &["tailwindcss", "@tailwindcss/vite"],
        config_files: &["tailwind.config.js", "tailwind.config.ts"],
        file_extensions: &[],
        skills: &["giuseppe-trisciuoglio/developer-kit/tailwind-css-patterns"],
    },
    TechDef {
        id: "shadcn", name: "shadcn/ui", category: "ui",
        packages: &[],
        config_files: &["components.json"],
        file_extensions: &[],
        skills: &["shadcn/ui/shadcn"],
    },

    // ── JavaScript/TypeScript Backend ─────────────────────
    TechDef {
        id: "nodejs", name: "Node.js", category: "backend",
        packages: &[],
        config_files: &["package-lock.json", "yarn.lock", "pnpm-lock.yaml", ".nvmrc"],
        file_extensions: &[],
        skills: &[
            "wshobson/agents/nodejs-backend-patterns",
        ],
    },
    TechDef {
        id: "express", name: "Express", category: "backend",
        packages: &["express"],
        config_files: &[],
        file_extensions: &[],
        skills: &["aj-geddes/useful-ai-prompts/nodejs-express-server"],
    },
    TechDef {
        id: "bun", name: "Bun", category: "runtime",
        packages: &[],
        config_files: &["bun.lockb", "bun.lock", "bunfig.toml"],
        file_extensions: &[],
        skills: &[],
    },
    TechDef {
        id: "deno", name: "Deno", category: "runtime",
        packages: &[],
        config_files: &["deno.json", "deno.jsonc", "deno.lock"],
        file_extensions: &[],
        skills: &[
            "denoland/skills/deno-expert",
            "denoland/skills/deno-guidance",
        ],
    },
    TechDef {
        id: "typescript", name: "TypeScript", category: "language",
        packages: &["typescript"],
        config_files: &["tsconfig.json"],
        file_extensions: &[".ts", ".tsx"],
        skills: &["wshobson/agents/typescript-advanced-types"],
    },
    TechDef {
        id: "vite", name: "Vite", category: "tooling",
        packages: &["vite"],
        config_files: &["vite.config.js", "vite.config.ts", "vite.config.mjs"],
        file_extensions: &[],
        skills: &["antfu/skills/vite"],
    },

    // ── Python ───────────────────────────────────────────
    TechDef {
        id: "python", name: "Python", category: "language",
        packages: &[],
        config_files: &["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "Pipfile", "poetry.lock"],
        file_extensions: &[".py"],
        skills: &[],
    },
    TechDef {
        id: "django", name: "Django", category: "backend",
        packages: &[],
        config_files: &["manage.py"],
        file_extensions: &[],
        skills: &[],
    },
    TechDef {
        id: "fastapi", name: "FastAPI", category: "backend",
        packages: &[],
        config_files: &[],
        file_extensions: &[],
        skills: &[],
    },
    TechDef {
        id: "flask", name: "Flask", category: "backend",
        packages: &[],
        config_files: &[],
        file_extensions: &[],
        skills: &[],
    },

    // ── Rust ─────────────────────────────────────────────
    TechDef {
        id: "rust", name: "Rust", category: "language",
        packages: &[],
        config_files: &["Cargo.toml", "Cargo.lock"],
        file_extensions: &[".rs"],
        skills: &[],
    },
    TechDef {
        id: "tokio", name: "Tokio", category: "async",
        packages: &[],
        config_files: &[],
        file_extensions: &[],
        skills: &[],
    },
    TechDef {
        id: "axum", name: "Axum", category: "backend",
        packages: &[],
        config_files: &[],
        file_extensions: &[],
        skills: &[],
    },

    // ── Kotlin/JVM ───────────────────────────────────────
    TechDef {
        id: "kotlin", name: "Kotlin", category: "language",
        packages: &[],
        config_files: &["build.gradle.kts", "settings.gradle.kts"],
        file_extensions: &[".kt", ".kts"],
        skills: &[],
    },
    TechDef {
        id: "android", name: "Android", category: "mobile",
        packages: &[],
        config_files: &["AndroidManifest.xml", "build.gradle", "build.gradle.kts"],
        file_extensions: &[],
        skills: &[],
    },
    TechDef {
        id: "spring", name: "Spring Boot", category: "backend",
        packages: &[],
        config_files: &["application.properties", "application.yml"],
        file_extensions: &[],
        skills: &[],
    },
    TechDef {
        id: "java", name: "Java", category: "language",
        packages: &[],
        config_files: &["pom.xml", "build.gradle"],
        file_extensions: &[".java"],
        skills: &[],
    },

    // ── Go ───────────────────────────────────────────────
    TechDef {
        id: "go", name: "Go", category: "language",
        packages: &[],
        config_files: &["go.mod", "go.sum"],
        file_extensions: &[".go"],
        skills: &[],
    },

    // ── Ruby ─────────────────────────────────────────────
    TechDef {
        id: "ruby", name: "Ruby", category: "language",
        packages: &[],
        config_files: &["Gemfile", "Gemfile.lock", ".ruby-version"],
        file_extensions: &[".rb"],
        skills: &[],
    },
    TechDef {
        id: "rails", name: "Ruby on Rails", category: "backend",
        packages: &[],
        config_files: &["config/routes.rb", "config/application.rb"],
        file_extensions: &[],
        skills: &[],
    },

    // ── Swift/iOS ────────────────────────────────────────
    TechDef {
        id: "swift", name: "Swift", category: "language",
        packages: &[],
        config_files: &["Package.swift"],
        file_extensions: &[".swift"],
        skills: &["avdlee/swiftui-agent-skill/swiftui-expert-skill"],
    },
    TechDef {
        id: "ios", name: "iOS", category: "mobile",
        packages: &[],
        config_files: &["Info.plist"],
        file_extensions: &[".xcodeproj", ".xcworkspace"],
        skills: &[],
    },

    // ── PHP ──────────────────────────────────────────────
    TechDef {
        id: "php", name: "PHP", category: "language",
        packages: &[],
        config_files: &["composer.json", "composer.lock"],
        file_extensions: &[".php"],
        skills: &[],
    },
    TechDef {
        id: "laravel", name: "Laravel", category: "backend",
        packages: &[],
        config_files: &["artisan"],
        file_extensions: &[".blade.php"],
        skills: &[],
    },
    TechDef {
        id: "wordpress", name: "WordPress", category: "cms",
        packages: &[],
        config_files: &["wp-config.php", "wp-login.php"],
        file_extensions: &[],
        skills: &[
            "wordpress/agent-skills/wp-plugin-development",
            "wordpress/agent-skills/wp-rest-api",
        ],
    },

    // ── Mobile ───────────────────────────────────────────
    TechDef {
        id: "expo", name: "Expo", category: "mobile",
        packages: &["expo"],
        config_files: &["app.json", "app.config.js"],
        file_extensions: &[],
        skills: &[
            "expo/skills/building-native-ui",
            "expo/skills/native-data-fetching",
        ],
    },
    TechDef {
        id: "react-native", name: "React Native", category: "mobile",
        packages: &["react-native"],
        config_files: &[],
        file_extensions: &[],
        skills: &["sleekdotdesign/agent-skills/sleek-design-mobile-apps"],
    },
    TechDef {
        id: "flutter", name: "Flutter", category: "mobile",
        packages: &[],
        config_files: &["pubspec.yaml", "pubspec.lock"],
        file_extensions: &[".dart"],
        skills: &[],
    },

    // ── Databases ────────────────────────────────────────
    TechDef {
        id: "supabase", name: "Supabase", category: "database",
        packages: &["@supabase/supabase-js", "@supabase/ssr"],
        config_files: &[],
        file_extensions: &[],
        skills: &["supabase/agent-skills/supabase-postgres-best-practices"],
    },
    TechDef {
        id: "prisma", name: "Prisma", category: "database",
        packages: &["prisma", "@prisma/client"],
        config_files: &["prisma/schema.prisma"],
        file_extensions: &[".prisma"],
        skills: &[],
    },
    TechDef {
        id: "drizzle", name: "Drizzle", category: "database",
        packages: &["drizzle-orm", "drizzle-kit"],
        config_files: &["drizzle.config.ts"],
        file_extensions: &[],
        skills: &[],
    },

    // ── DevOps/Cloud ─────────────────────────────────────
    TechDef {
        id: "docker", name: "Docker", category: "devops",
        packages: &[],
        config_files: &["Dockerfile", "docker-compose.yml", "docker-compose.yaml", ".dockerignore"],
        file_extensions: &[],
        skills: &[],
    },
    TechDef {
        id: "cloudflare", name: "Cloudflare", category: "cloud",
        packages: &["wrangler", "@cloudflare/workers-types"],
        config_files: &["wrangler.toml", "wrangler.json"],
        file_extensions: &[],
        skills: &[
            "cloudflare/skills/cloudflare",
            "cloudflare/skills/workers-best-practices",
        ],
    },
    TechDef {
        id: "vercel", name: "Vercel", category: "cloud",
        packages: &["vercel"],
        config_files: &["vercel.json", ".vercel"],
        file_extensions: &[],
        skills: &["vercel-labs/agent-skills/deploy-to-vercel"],
    },
    TechDef {
        id: "terraform", name: "Terraform", category: "infra",
        packages: &[],
        config_files: &[],
        file_extensions: &[".tf", ".tfvars"],
        skills: &[],
    },
    TechDef {
        id: "github-actions", name: "GitHub Actions", category: "ci",
        packages: &[],
        config_files: &[".github/workflows"],
        file_extensions: &[],
        skills: &[],
    },

    // ── Testing ──────────────────────────────────────────
    TechDef {
        id: "playwright", name: "Playwright", category: "testing",
        packages: &["@playwright/test", "playwright"],
        config_files: &["playwright.config.ts", "playwright.config.js"],
        file_extensions: &[],
        skills: &["currents-dev/playwright-best-practices-skill/playwright-best-practices"],
    },
    TechDef {
        id: "vitest", name: "Vitest", category: "testing",
        packages: &["vitest"],
        config_files: &["vitest.config.ts"],
        file_extensions: &[],
        skills: &[],
    },
    TechDef {
        id: "jest", name: "Jest", category: "testing",
        packages: &["jest", "@jest/core"],
        config_files: &["jest.config.js", "jest.config.ts"],
        file_extensions: &[],
        skills: &[],
    },
    TechDef {
        id: "pytest", name: "pytest", category: "testing",
        packages: &[],
        config_files: &["pytest.ini", "conftest.py"],
        file_extensions: &[],
        skills: &[],
    },

    // ── AI/ML ────────────────────────────────────────────
    TechDef {
        id: "vercel-ai", name: "Vercel AI SDK", category: "ai",
        packages: &["ai", "@ai-sdk/openai", "@ai-sdk/anthropic"],
        config_files: &[],
        file_extensions: &[],
        skills: &["vercel/ai/ai-sdk"],
    },
    TechDef {
        id: "langchain", name: "LangChain", category: "ai",
        packages: &["langchain"],
        config_files: &[],
        file_extensions: &[],
        skills: &[],
    },

    // ── Animation ────────────────────────────────────────
    TechDef {
        id: "gsap", name: "GSAP", category: "animation",
        packages: &["gsap"],
        config_files: &[],
        file_extensions: &[],
        skills: &[
            "greensock/gsap-skills/gsap-core",
            "greensock/gsap-skills/gsap-scrolltrigger",
        ],
    },
];

// ── Detection engine ─────────────────────────────────────────────

fn read_package_json(project_dir: &Path) -> Option<serde_json::Value> {
    let pkg_path = project_dir.join("package.json");
    let content = std::fs::read_to_string(pkg_path).ok()?;
    serde_json::from_str(&content).ok()
}

fn get_all_packages(pkg: &serde_json::Value) -> HashSet<String> {
    let mut packages = HashSet::new();
    for key in &["dependencies", "devDependencies", "peerDependencies"] {
        if let Some(deps) = pkg.get(key).and_then(|v| v.as_object()) {
            for name in deps.keys() {
                packages.insert(name.clone());
            }
        }
    }
    packages
}

fn file_exists(project_dir: &Path, name: &str) -> bool {
    project_dir.join(name).exists()
}

fn has_extension_in_dir(project_dir: &Path, ext: &str, max_depth: u8) -> bool {
    scan_for_ext(project_dir, ext, 0, max_depth)
}

fn scan_for_ext(dir: &Path, ext: &str, depth: u8, max_depth: u8) -> bool {
    if depth > max_depth { return false; }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return false,
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || matches!(name.as_str(),
            "node_modules" | "target" | "dist" | "build" | ".git" | "__pycache__" |
            "vendor" | ".next" | ".output" | "coverage" | ".turbo"
        ) {
            continue;
        }
        if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            if name.ends_with(ext) { return true; }
        } else if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            if scan_for_ext(&entry.path(), ext, depth + 1, max_depth) { return true; }
        }
    }
    false
}

fn detect_python_packages(project_dir: &Path) -> HashSet<String> {
    let mut packages = HashSet::new();

    // requirements.txt
    if let Ok(content) = std::fs::read_to_string(project_dir.join("requirements.txt")) {
        for line in content.lines() {
            let pkg = line.split(&['=', '>', '<', '[', ';', '#'][..]).next().unwrap_or("").trim();
            if !pkg.is_empty() && !pkg.starts_with('-') {
                packages.insert(pkg.to_lowercase());
            }
        }
    }

    // pyproject.toml — simple detection
    if let Ok(content) = std::fs::read_to_string(project_dir.join("pyproject.toml")) {
        if content.contains("django") { packages.insert("django".into()); }
        if content.contains("fastapi") { packages.insert("fastapi".into()); }
        if content.contains("flask") { packages.insert("flask".into()); }
        if content.contains("langchain") { packages.insert("langchain".into()); }
        if content.contains("pytest") { packages.insert("pytest".into()); }
    }

    packages
}

fn detect_rust_crates(project_dir: &Path) -> HashSet<String> {
    let mut crates = HashSet::new();
    if let Ok(content) = std::fs::read_to_string(project_dir.join("Cargo.toml")) {
        if content.contains("tokio") { crates.insert("tokio".into()); }
        if content.contains("axum") { crates.insert("axum".into()); }
        if content.contains("actix") { crates.insert("actix".into()); }
        if content.contains("serde") { crates.insert("serde".into()); }
        if content.contains("wasm") { crates.insert("wasm".into()); }
    }
    crates
}

// ── NAPI export ──────────────────────────────────────────────────

/// Detect technologies in a project directory.
/// Returns JSON with detected technologies, categories, and recommended skills.
#[napi]
pub fn detect_technologies(project_dir: String) -> serde_json::Value {
    let dir = Path::new(&project_dir);
    let npm_packages = read_package_json(dir)
        .map(|pkg| get_all_packages(&pkg))
        .unwrap_or_default();
    let python_packages = detect_python_packages(dir);
    let rust_crates = detect_rust_crates(dir);

    let mut detected: Vec<serde_json::Value> = Vec::new();
    let mut all_skills: Vec<String> = Vec::new();
    let mut categories: HashSet<String> = HashSet::new();

    for tech in TECHS {
        let mut found = false;

        // Check npm packages
        if !found && !tech.packages.is_empty() {
            found = tech.packages.iter().any(|p| npm_packages.contains(*p));
        }

        // Check Python packages
        if !found && matches!(tech.id, "django" | "fastapi" | "flask" | "langchain" | "pytest") {
            found = python_packages.contains(tech.id);
        }

        // Check Rust crates
        if !found && matches!(tech.id, "tokio" | "axum") {
            found = rust_crates.contains(tech.id);
        }

        // Check config files
        if !found && !tech.config_files.is_empty() {
            found = tech.config_files.iter().any(|f| file_exists(dir, f));
        }

        // Check file extensions (scan top 3 levels)
        if !found && !tech.file_extensions.is_empty() {
            found = tech.file_extensions.iter().any(|ext| has_extension_in_dir(dir, ext, 3));
        }

        if found {
            categories.insert(tech.category.to_string());
            for skill in tech.skills {
                if !all_skills.contains(&skill.to_string()) {
                    all_skills.push(skill.to_string());
                }
            }
            detected.push(json!({
                "id": tech.id,
                "name": tech.name,
                "category": tech.category,
                "skills": tech.skills,
            }));
        }
    }

    json!({
        "detected": detected,
        "categories": categories.into_iter().collect::<Vec<_>>(),
        "skills": all_skills,
        "total_technologies": detected.len(),
        "total_skills": all_skills.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_nothing_in_empty_dir() {
        let dir = std::env::temp_dir().join("aiyoucli-test-empty");
        std::fs::create_dir_all(&dir).ok();
        let result = detect_technologies(dir.to_string_lossy().to_string());
        assert_eq!(result["total_technologies"], 0);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn detects_rust_from_cargo() {
        let dir = std::env::temp_dir().join("aiyoucli-test-rust");
        std::fs::create_dir_all(&dir).ok();
        std::fs::write(dir.join("Cargo.toml"), "[package]\nname = \"test\"").ok();
        let result = detect_technologies(dir.to_string_lossy().to_string());
        let detected: Vec<String> = result["detected"].as_array().unwrap()
            .iter().map(|v| v["id"].as_str().unwrap().to_string()).collect();
        assert!(detected.contains(&"rust".to_string()));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn detects_python_from_requirements() {
        let dir = std::env::temp_dir().join("aiyoucli-test-python");
        std::fs::create_dir_all(&dir).ok();
        std::fs::write(dir.join("requirements.txt"), "django==4.2\ncelery>=5.0").ok();
        let result = detect_technologies(dir.to_string_lossy().to_string());
        let detected: Vec<String> = result["detected"].as_array().unwrap()
            .iter().map(|v| v["id"].as_str().unwrap().to_string()).collect();
        assert!(detected.contains(&"python".to_string()));
        assert!(detected.contains(&"django".to_string()));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn detects_node_react_from_package_json() {
        let dir = std::env::temp_dir().join("aiyoucli-test-react");
        std::fs::create_dir_all(&dir).ok();
        std::fs::write(dir.join("package.json"), r#"{"dependencies":{"react":"18","next":"14"}}"#).ok();
        std::fs::write(dir.join("package-lock.json"), "{}").ok();
        std::fs::write(dir.join("tsconfig.json"), "{}").ok();
        let result = detect_technologies(dir.to_string_lossy().to_string());
        let detected: Vec<String> = result["detected"].as_array().unwrap()
            .iter().map(|v| v["id"].as_str().unwrap().to_string()).collect();
        assert!(detected.contains(&"react".to_string()));
        assert!(detected.contains(&"nextjs".to_string()));
        assert!(detected.contains(&"nodejs".to_string()));
        assert!(detected.contains(&"typescript".to_string()));
        assert!(result["total_skills"].as_u64().unwrap() > 0);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn returns_skills_for_detected() {
        let dir = std::env::temp_dir().join("aiyoucli-test-skills");
        std::fs::create_dir_all(&dir).ok();
        std::fs::write(dir.join("package.json"), r#"{"dependencies":{"@supabase/supabase-js":"2"}}"#).ok();
        let result = detect_technologies(dir.to_string_lossy().to_string());
        let skills = result["skills"].as_array().unwrap();
        assert!(!skills.is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }
}
