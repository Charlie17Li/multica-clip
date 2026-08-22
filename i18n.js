const translations = {
  en: {
    popupTitle: "Multica Knowledge Capture", captureToMultica: "Capture to Multica", settings: "Settings",
    currentPage: "Current page", title: "Title", url: "URL", site: "Site", loading: "Loading…",
    note: "Note", optional: "(optional)", notePlaceholder: "Why is this worth keeping?", optionalContent: "Optional content",
    includeSnapshot: "I confirm that I want to extract and upload a page-text snapshot",
    snapshotHint: "A snapshot is read only after this confirmation. If it cannot be extracted, we create a link-mode issue instead.",
    privacy: "By default, only this page's URL, title, site, capture time, and your note are submitted.",
    createIssue: "Create capture issue",
    captureDestination: "Capture destination", destinationPickerHint: "The site-matched destination is selected by default. Changes here apply only to this capture.",
    settingsTitle: "Multica Knowledge Capture settings", settingsIntro: "Configure the Multica connection, then choose a project and agent for each site you capture from.",
    language: "Language", english: "English", chinese: "中文", serverUrl: "Multica server URL", accessToken: "Access token",
    tokenPlaceholder: "Paste a personal access token", tokenHint: "Stored only in this browser's extension storage and sent only to the configured Multica server.",
    workspace: "Workspace", loadFirst: "Load destinations first", loadDestinations: "Load workspaces, projects, and agents",
    captureDestinations: "Capture destinations", destinationHint: "Use an exact domain such as <code>example.com</code>, <code>*.example.com</code> for subdomains, or <code>*</code> as the default.",
    addDestination: "Add domain destination", saveSettings: "Save settings", domainDestination: "Domain destination", domain: "Domain", project: "Project", agent: "Agent", remove: "Remove",
    domainPlaceholder: "example.com or *", selectProject: "Select a project", selectAgent: "Select an agent",
    openCreatedIssue: "Open created issue", preparing: "Preparing capture…", creating: "Creating issue…", settingsSaved: "Settings saved.",
    destinationsLoaded: "Destinations loaded. Select a workspace, project, and agent.", configureFirst: "Configure a Multica destination for {site} in Settings first.",
    openHttpPage: "Open an http(s) page to capture it.", saveAuthorization: "Save authorization settings to grant access to this Multica server.",
    created: "Created {reference}{fallback}", snapshotFallback: " in link mode because the snapshot could not be extracted.",
    serverAccessRequired: "Server access permission is required to load destinations.", enterServer: "Enter the Multica server URL and access token first.",
    noWorkspaces: "No accessible workspaces were found.", loadToChoose: "Load destinations to choose a workspace, project, and agent.",
    incompleteDestination: "Add a domain, project ID, and agent ID for every destination.", invalidDomain: "Domains must be hostnames, *.hostnames, or *.", duplicateDomain: "Each domain can have only one destination.",
    selectWorkspace: "Load destinations and select a workspace first.", createPermission: "Server access permission is required to create issues.",
    copyDiagnostics: "Copy diagnostic report", diagnosticsCopied: "Diagnostic report copied. You can safely include it in a support request.", diagnosticsHelp: "Include the copied report when asking for help. It excludes your token, note, snapshot, and page URL."
  },
  "zh-CN": {
    popupTitle: "Multica 知识采集", captureToMultica: "采集到 Multica", settings: "设置",
    currentPage: "当前页面", title: "标题", url: "网址", site: "站点", loading: "加载中…",
    note: "备注", optional: "（可选）", notePlaceholder: "为什么值得保留？", optionalContent: "可选内容",
    includeSnapshot: "我确认要提取并上传页面文字快照",
    snapshotHint: "只有在确认后才会读取页面快照。若无法提取，将改为创建仅含链接的 issue。",
    privacy: "默认只会提交本页的网址、标题、站点、采集时间和你的备注。",
    createIssue: "创建采集 issue",
    captureDestination: "采集目标", destinationPickerHint: "默认选中当前站点匹配的目标；在这里的调整仅对此次采集生效。",
    settingsTitle: "Multica 知识采集设置", settingsIntro: "配置 Multica 连接，然后为每个要采集的网站选择项目和 Agent。",
    language: "语言", english: "English", chinese: "中文", serverUrl: "Multica 服务器网址", accessToken: "访问令牌",
    tokenPlaceholder: "粘贴个人访问令牌", tokenHint: "令牌只保存在浏览器扩展的存储中，并且只会发送到配置的 Multica 服务器。",
    workspace: "工作区", loadFirst: "请先加载采集目标", loadDestinations: "加载工作区、项目和 Agent",
    captureDestinations: "采集目标", destinationHint: "可使用精确域名（如 <code>example.com</code>）、子域名通配符（<code>*.example.com</code>）或默认值 <code>*</code>。",
    addDestination: "添加域名目标", saveSettings: "保存设置", domainDestination: "域名目标", domain: "域名", project: "项目", agent: "Agent", remove: "移除",
    domainPlaceholder: "example.com 或 *", selectProject: "选择项目", selectAgent: "选择 Agent",
    openCreatedIssue: "打开已创建的 issue", preparing: "正在准备采集…", creating: "正在创建 issue…", settingsSaved: "设置已保存。",
    destinationsLoaded: "目标已加载。请选择工作区、项目和 Agent。", configureFirst: "请先在“设置”中为 {site} 配置 Multica 目标。",
    openHttpPage: "请打开一个 http(s) 页面后再采集。", saveAuthorization: "请保存授权设置以授予该 Multica 服务器访问权限。",
    created: "已创建 {reference}{fallback}", snapshotFallback: "；因无法提取快照，已使用仅链接模式。",
    serverAccessRequired: "加载目标需要授予服务器访问权限。", enterServer: "请先输入 Multica 服务器网址和访问令牌。",
    noWorkspaces: "未找到可访问的工作区。", loadToChoose: "请加载目标以选择工作区、项目和 Agent。",
    incompleteDestination: "请为每个目标填写域名、项目 ID 和 Agent ID。", invalidDomain: "域名必须是主机名、*.主机名或 *。", duplicateDomain: "每个域名只能有一个目标。",
    selectWorkspace: "请先加载目标并选择工作区。", createPermission: "创建 issue 需要授予服务器访问权限。",
    copyDiagnostics: "复制诊断报告", diagnosticsCopied: "诊断报告已复制，可安全附在求助信息中。", diagnosticsHelp: "求助时请附上复制的报告；其中不包含令牌、备注、快照或页面网址。"
  }
};

function t(key, values = {}) {
  const language = document.documentElement.lang in translations ? document.documentElement.lang : "en";
  return (translations[language][key] || translations.en[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}

function applyLanguage(language) {
  const selected = language in translations ? language : "en";
  document.documentElement.lang = selected;
  document.querySelectorAll("[data-i18n]").forEach((element) => { element.innerHTML = t(element.dataset.i18n); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  document.title = t(document.body.dataset.titleKey || "popupTitle");
}
