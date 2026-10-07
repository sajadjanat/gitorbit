import { gitToolsMessages } from "./git-tools-messages";
// English source keys provide readable fallback text.
export const messages: Record<string, {fa: string; ar: string; zh: string}> = {
  ...gitToolsMessages,
  "Your Git credentials are missing or expired. Sign in, then retry fetching.": {fa:"اعتبارنامه گیت موجود نیست یا منقضی شده. وارد شوید و دوباره فچ کنید.",ar:"بيانات اعتماد Git مفقودة أو منتهية. سجّل الدخول ثم أعد الجلب.",zh:"Git 凭据缺失或已过期。请登录后重试获取。"},
  "Cancel": {fa:"انصراف", ar:"إلغاء", zh:"取消"},
  "Sign-in completed. Retry fetching to check incoming commits.": {fa:"ورود انجام شد. برای بررسی کامیت‌های ورودی، فچ را دوباره بزنید.",ar:"اكتمل الدخول. أعد الجلب للتحقق من الالتزامات الواردة.",zh:"登录完成。请重试获取以检查传入提交。"},
  "Sync before pushing": {"fa":"همگام‌سازی پیش از پوش","ar":"مزامنة قبل الدفع","zh":"推送前同步"},
  "Finish the current Git operation": {"fa":"عملیات فعلی گیت را تکمیل کنید","ar":"أكمل عملية Git الحالية","zh":"完成当前 Git 操作"},
  "{ahead} local · {behind} incoming": {"fa":"{ahead} کامیت لوکال · {behind} کامیت ورودی","ar":"{ahead} محلي · {behind} وارد","zh":"{ahead} 个本地提交 · {behind} 个传入提交"},
  "Review conflicts, stage the resolved files, and commit the merge before pushing.": {"fa":"تداخل‌ها را بررسی کنید، فایل‌های اصلاح‌شده را استیج کنید و ادغام را کامیت کنید؛ سپس پوش بزنید.","ar":"راجع التعارضات وجهّز الملفات المحلولة ثم التزم بالدمج قبل الدفع.","zh":"检查冲突、暂存已解决的文件并提交合并，然后推送。"},
  "Finish the current Git operation using Git before syncing.": {"fa":"عملیات فعلی گیت را با ابزار گیت تکمیل کنید؛ سپس همگام‌سازی کنید.","ar":"أكمل عملية Git الحالية باستخدام Git قبل المزامنة.","zh":"先使用 Git 完成当前操作，再同步。"},
  "Commit or stash local file changes before syncing. Your commits are preserved.": {"fa":"پیش از همگام‌سازی، تغییرات فایل‌ها را کامیت یا استش کنید. کامیت‌های شما حفظ می‌شوند.","ar":"التزم بتغييرات الملفات أو خبّئها قبل المزامنة. تُحفظ التزاماتك.","zh":"同步前请提交更改或使用 git stash 保存工作区更改。已有提交会保留。"},
  "No incoming commits. Refresh the push preview to continue.": {"fa":"کامیت ورودی ندارید. پیش‌نمایش پوش را تازه کنید و ادامه دهید.","ar":"لا توجد التزامات واردة. حدّث معاينة الدفع للمتابعة.","zh":"没有传入提交。刷新推送预览以继续。"},
  "Both branches have new commits. Merge the incoming commits, review the result, then push.": {"fa":"هر دو شاخه کامیت جدید دارند. کامیت‌های ورودی را ادغام کنید، نتیجه را ببینید و سپس پوش بزنید.","ar":"كلا الفرعين يحتوي على التزامات جديدة. ادمج الواردة وراجع النتيجة ثم ادفع.","zh":"两个分支都有新提交。合并传入提交，检查结果后再推送。"},
  "Your branch is behind. Pull the incoming commits, then review the push preview.": {"fa":"شاخهٔ شما عقب است. کامیت‌های ورودی را پول بگیرید و سپس پیش‌نمایش پوش را بررسی کنید.","ar":"فرعك متأخر. اسحب الالتزامات الواردة ثم راجع معاينة الدفع.","zh":"当前分支落后。拉取传入提交后再检查推送预览。"},
  "Fetch updates the preview. Sync preserves existing commits and never force-pushes or stashes files.": {"fa":"فچ، پیش‌نمایش را به‌روز می‌کند. همگام‌سازی کامیت‌ها را حفظ می‌کند و پوش اجباری یا استش خودکار ندارد.","ar":"يحدّث الجلب المعاينة. تحفظ المزامنة الالتزامات دون دفع قسري أو تخبئة تلقائية.","zh":"获取会更新预览。同步保留已有提交，不会强制推送或自动暂存工作区。"},
  "The remote has new work. Fetch and check it before trying again.": {"fa":"ریموت تغییرات جدید دارد. پیش از تلاش دوباره، فچ و بررسی کنید.","ar":"يحتوي البعيد على تغييرات جديدة. اجلبها وراجعها قبل المحاولة مجددًا.","zh":"远程有新更改。重试前请先获取并检查。"},
  "Fetch and check": {"fa":"فچ و بررسی","ar":"جلب وفحص","zh":"获取并检查"},
  "Merge incoming commits": {"fa":"ادغام کامیت‌های ورودی","ar":"دمج الالتزامات الواردة","zh":"合并传入提交"},
  "Pull incoming commits": {"fa":"پول کامیت‌های ورودی","ar":"سحب الالتزامات الواردة","zh":"拉取传入提交"},
  "Review push preview": {"fa":"بررسی پیش‌نمایش پوش","ar":"مراجعة معاينة الدفع","zh":"检查推送预览"},
  "Review in Version Control": {"fa":"بررسی در کنترل نسخه","ar":"مراجعة في التحكم بالإصدارات","zh":"在版本控制中检查"},
  "Abort merge": {"fa":"لغو ادغام","ar":"إلغاء الدمج","zh":"中止合并"},
  "Incoming commits ({count})": {"fa":"کامیت‌های ورودی ({count})","ar":"الالتزامات الواردة ({count})","zh":"传入提交（{count}）"},
  "Abort this merge?": {"fa":"این ادغام لغو شود؟","ar":"هل تريد إلغاء هذا الدمج؟","zh":"中止此合并？"},
  "This restores the branch before the merge and discards edits made to resolve its conflicts. Existing commits remain intact.": {"fa":"شاخه به وضعیت پیش از ادغام بازمی‌گردد و ویرایش‌هایی که برای حل تداخل انجام داده‌اید کنار گذاشته می‌شوند. کامیت‌های قبلی حفظ می‌شوند.","ar":"يُستعاد الفرع قبل الدمج وتُحذف التعديلات التي أجريتها لحل تعارضاته. تبقى الالتزامات السابقة سليمة.","zh":"这会恢复合并前的分支状态，并丢弃为解决冲突所做的编辑。已有提交不受影响。"},
  "The remote changed. Check incoming commits and sync before pushing.": {"fa":"ریموت تغییر کرده است. کامیت‌های ورودی را بررسی و پیش از پوش همگام‌سازی کنید.","ar":"تغيّر البعيد. راجع الالتزامات الواردة وزامن قبل الدفع.","zh":"远程已更改。推送前请检查传入提交并同步。"},
  "Push and fetch destinations differ. Sync the push destination using Git, then retry.": {"fa":"مقصد پوش و فچ متفاوت است. مقصد پوش را با گیت همگام کنید و دوباره تلاش کنید.","ar":"وجهتا الدفع والجلب مختلفتان. زامن وجهة الدفع باستخدام Git ثم أعد المحاولة.","zh":"推送与获取目标不同。请使用 Git 同步推送目标后重试。"},
  "These branches have no common ancestor. Review them using Git before syncing.": {"fa":"این شاخه‌ها تاریخچهٔ مشترک ندارند. پیش از همگام‌سازی آن‌ها را با گیت بررسی کنید.","ar":"لا يوجد أصل مشترك للفرعين. راجعهما باستخدام Git قبل المزامنة.","zh":"分支没有共同祖先。同步前请使用 Git 检查。"},
  "The branch or incoming commits changed. Fetch and review again before syncing.": {"fa":"شاخه یا کامیت‌های ورودی تغییر کرده‌اند. دوباره فچ و بررسی کنید و سپس همگام‌سازی کنید.","ar":"تغيّر الفرع أو الالتزامات الواردة. اجلب وراجع مجددًا قبل المزامنة.","zh":"分支或传入提交已更改。同步前请重新获取并检查。"},
  "A Git operation is already in progress. Finish it before syncing.": {"fa":"عملیات دیگری در گیت در حال انجام است. پیش از همگام‌سازی آن را تکمیل کنید.","ar":"توجد عملية Git جارية. أكملها قبل المزامنة.","zh":"已有 Git 操作正在进行。完成后再同步。"},
  "The merge changed. Refresh before cancelling it.": {"fa":"وضعیت ادغام تغییر کرده است. پیش از لغو، تازه‌سازی کنید.","ar":"تغيّر الدمج. حدّث قبل إلغائه.","zh":"合并状态已更改。取消前请刷新。"},
  "This remote has multiple push destinations. Sync each destination using Git.": {"fa":"این ریموت چند مقصد پوش دارد. هر مقصد را با گیت همگام کنید.","ar":"للبعيد وجهات دفع متعددة. زامن كل وجهة باستخدام Git.","zh":"此远程有多个推送目标。请使用 Git 分别同步。"},
  "The push destination could not be verified. Check the remote branch using Git.": {"fa":"مقصد پوش قابل تأیید نبود. شاخهٔ ریموت را با گیت بررسی کنید.","ar":"تعذّر التحقق من وجهة الدفع. افحص الفرع البعيد باستخدام Git.","zh":"无法验证推送目标。请使用 Git 检查远程分支。"},
  "Git sign-in required": {fa: "نیاز به ورود به گیت", ar: "تسجيل الدخول إلى Git مطلوب", zh: "需要登录 Git"},
  "Git sign-in completed": {fa: "ورود به گیت انجام شد", ar: "تم تسجيل الدخول إلى Git", zh: "Git 登录已完成"},
  "Your Git credentials are missing or expired. Sign in, then retry the push.": {fa: "اطلاعات ورود گیت موجود نیست یا اعتبارش تمام شده است. وارد شوید و پوش را دوباره بزنید.", ar: "بيانات اعتماد Git مفقودة أو منتهية الصلاحية. سجّل الدخول ثم أعد محاولة الدفع.", zh: "Git 凭据缺失或已过期。请登录后重试推送。"},
  "Click Retry push to send the reviewed commits. Your local changes are preserved.": {fa: "برای ارسال کامیت‌های بررسی‌شده، «تلاش دوباره برای پوش» را بزنید. تغییرات محلی شما حفظ می‌شوند.", ar: "انقر على إعادة محاولة الدفع لإرسال الالتزامات التي راجعتها. تغييراتك المحلية محفوظة.", zh: "点击重试推送以发送已审阅的提交。本地更改会保留。"},
  "Complete sign-in in the Git window or browser. You can cancel at any time.": {fa: "ورود را در پنجرهٔ گیت یا مرورگر کامل کنید. هر زمان خواستید می‌توانید لغو کنید.", ar: "أكمل تسجيل الدخول في نافذة Git أو المتصفح. يمكنك الإلغاء في أي وقت.", zh: "请在 Git 窗口或浏览器中完成登录。随时可以取消。"},
  "Use your Git account and an access token if the server requires one. Git Credential Manager handles your credentials; GitOrbit does not receive your password.": {fa: "از حساب گیت و در صورت نیاز سرور، توکن دسترسی استفاده کنید. Git Credential Manager اطلاعات ورود را مدیریت می‌کند؛ GitOrbit رمز شما را دریافت نمی‌کند.", ar: "استخدم حساب Git ورمز وصول إذا طلبه الخادم. يتولى Git Credential Manager بيانات الاعتماد؛ لا يتلقى GitOrbit كلمة مرورك.", zh: "使用 Git 账号，如服务器要求则使用访问令牌。凭据由 Git Credential Manager 管理；GitOrbit 不会接收密码。"},
  "Signing in…": {fa: "در حال ورود…", ar: "جارٍ تسجيل الدخول…", zh: "正在登录…"},
  "Cancel sign-in": {fa: "لغو ورود", ar: "إلغاء تسجيل الدخول", zh: "取消登录"},
  "Cancelling…": {fa: "در حال لغو…", ar: "جارٍ الإلغاء…", zh: "正在取消…"},
  "Retry push": {fa: "تلاش دوباره برای پوش", ar: "إعادة محاولة الدفع", zh: "重试推送"},
  "Sign in to Git": {fa: "ورود به گیت", ar: "تسجيل الدخول إلى Git", zh: "登录 Git"},
  "Set up Git sign-in": {fa: "راه‌اندازی ورود گیت", ar: "إعداد تسجيل الدخول إلى Git", zh: "设置 Git 登录"},
  "Recheck sign-in setup": {fa: "بررسی دوبارهٔ تنظیمات ورود", ar: "إعادة فحص إعداد تسجيل الدخول", zh: "重新检查登录设置"},
  "Git error details": {fa: "جزئیات خطای گیت", ar: "تفاصيل خطأ Git", zh: "Git 错误详情"},
  "Could not cancel sign-in. Close the Git login window or wait for the timeout.": {fa: "لغو ورود انجام نشد. پنجرهٔ ورود گیت را ببندید یا تا پایان مهلت صبر کنید.", ar: "تعذّر إلغاء تسجيل الدخول. أغلق نافذة تسجيل الدخول إلى Git أو انتظر انتهاء المهلة.", zh: "无法取消登录。请关闭 Git 登录窗口或等待超时。"},
  "Sign-in cancelled. You can try again.": {fa: "ورود لغو شد. می‌توانید دوباره تلاش کنید.", ar: "أُلغي تسجيل الدخول. يمكنك المحاولة مرة أخرى.", zh: "登录已取消。可以重试。"},
  "Sign-in timed out. You can try again.": {fa: "مهلت ورود تمام شد. می‌توانید دوباره تلاش کنید.", ar: "انتهت مهلة تسجيل الدخول. يمكنك المحاولة مرة أخرى.", zh: "登录超时。可以重试。"},
  "Sign-in was not completed. Check your account, access token, and repository permissions, then try again.": {fa: "ورود کامل نشد. حساب، توکن دسترسی و دسترسی به ریپو را بررسی و دوباره تلاش کنید.", ar: "لم يكتمل تسجيل الدخول. تحقق من الحساب ورمز الوصول وصلاحيات المستودع ثم أعد المحاولة.", zh: "登录未完成。请检查账号、访问令牌和仓库权限后重试。"},
  "Install and configure Git Credential Manager, then refresh this page.": {fa: "Git Credential Manager را نصب و تنظیم کنید، سپس تنظیمات ورود را دوباره بررسی کنید.", ar: "ثبّت Git Credential Manager واضبطه، ثم أعد فحص إعدادات تسجيل الدخول.", zh: "请安装并配置 Git Credential Manager，然后重新检查登录设置。"},
  "Use HTTPS with Git Credential Manager, or configure your SSH key and retry.": {fa: "از HTTPS با Git Credential Manager استفاده کنید، یا کلید SSH خود را تنظیم و دوباره تلاش کنید.", ar: "استخدم HTTPS مع Git Credential Manager أو اضبط مفتاح SSH ثم أعد المحاولة.", zh: "请使用 HTTPS 和 Git Credential Manager，或配置 SSH 密钥后重试。"},
  "Remove embedded credentials from the remote URL before signing in.": {fa: "پیش از ورود، اطلاعات ورودِ داخل آدرس ریموت را حذف کنید.", ar: "أزل بيانات الاعتماد المضمّنة في عنوان الخادم البعيد قبل تسجيل الدخول.", zh: "登录前请移除远程 URL 中嵌入的凭据。"},
  "Sign in to each push destination using Git, then retry.": {fa: "با گیت به هر مقصد پوش وارد شوید، سپس دوباره تلاش کنید.", ar: "سجّل الدخول إلى كل وجهة دفع باستخدام Git ثم أعد المحاولة.", zh: "请通过 Git 登录每个推送目标后重试。"},
  "The push destination changed. Refresh before signing in.": {fa: "مقصد پوش تغییر کرده است. پیش از ورود، فهرست را تازه‌سازی کنید.", ar: "تغيّرت وجهة الدفع. حدّث القائمة قبل تسجيل الدخول.", zh: "推送目标已更改。登录前请刷新。"},
  "Could not open Git sign-in. Check Git Credential Manager setup.": {fa: "پنجرهٔ ورود گیت باز نشد. تنظیمات Git Credential Manager را بررسی کنید.", ar: "تعذّر فتح تسجيل الدخول إلى Git. تحقق من إعداد Git Credential Manager.", zh: "无法打开 Git 登录。请检查 Git Credential Manager 设置。"},
  "Could not complete Git sign-in.": {fa: "ورود به گیت کامل نشد.", ar: "تعذّر إكمال تسجيل الدخول إلى Git.", zh: "无法完成 Git 登录。"},
  "Could not manage sign-in.": {fa: "مدیریت ورود گیت انجام نشد.", ar: "تعذّر إدارة تسجيل الدخول.", zh: "无法管理登录。"},
  "Invalid sign-in session.": {fa: "نشست ورود معتبر نیست.", ar: "جلسة تسجيل الدخول غير صالحة.", zh: "登录会话无效。"},
  "Another sign-in is in progress.": {fa: "یک ورود دیگر در حال انجام است.", ar: "عملية تسجيل دخول أخرى قيد التنفيذ.", zh: "另一个登录正在进行中。"},
  "Back to outgoing commits": {
    "fa": "بازگشت به کامیت‌های خروجی",
    "ar": "العودة إلى الالتزامات الصادرة",
    "zh": "返回待推送提交"
  },
  "Empty tree": {
    "fa": "نسخهٔ خالی",
    "ar": "شجرة فارغة",
    "zh": "空树"
  },
  "Choose a file from the selected commit.": {
    "fa": "فایلی از کامیت انتخاب‌شده را انتخاب کنید.",
    "ar": "اختر ملفًا من الالتزام المحدد.",
    "zh": "请选择所选提交中的文件。"
  },
  "Create branch": {fa: "ساخت برنچ", ar: "إنشاء فرع", zh: "创建分支"},
  "A Git operation is already in progress. Finish or abort it before creating a branch.": {fa: "یک عملیات گیت هنوز تمام نشده است. پیش از ساخت برنچ، آن را تکمیل یا لغو کنید.", ar: "هناك عملية Git لم تكتمل بعد. أكملها أو ألغها قبل إنشاء فرع.", zh: "Git 操作尚未完成。创建分支前，请完成或中止该操作。"},
  "A branch with this name already exists.": {fa: "برنچی با این نام از قبل وجود دارد.", ar: "يوجد فرع بهذا الاسم بالفعل.", zh: "已存在同名分支。"},
  "Branch name": {fa: "نام برنچ", ar: "اسم الفرع", zh: "分支名称"},
  "Create a branch from the current HEAD and switch to it. Local changes are kept.": {fa: "برنچ از موقعیت فعلی ساخته می‌شود و به آن منتقل می‌شوید. تغییرات محلی حفظ می‌شوند.", ar: "إنشاء فرع من HEAD الحالي والانتقال إليه. تُحفظ التغييرات المحلية.", zh: "从当前 HEAD 创建分支并切换到该分支。保留本地更改。"},
  "Enter a branch name.": {fa: "نام برنچ را وارد کنید.", ar: "أدخل اسم الفرع.", zh: "请输入分支名称。"},
  "Enter a valid branch name.": {fa: "یک نام معتبر برای برنچ وارد کنید.", ar: "أدخل اسم فرع صالحًا.", zh: "请输入有效的分支名称。"},
  "Create an initial commit before creating a branch.": {fa: "پیش از ساخت برنچ، اولین کامیت را ایجاد کنید.", ar: "أنشئ أول التزام قبل إنشاء فرع.", zh: "创建分支前请先创建初始提交。"},
  "Resolve conflicts before creating a branch.": {fa: "پیش از ساخت برنچ، تداخل‌ها را برطرف کنید.", ar: "حل التعارضات قبل إنشاء فرع.", zh: "创建分支前请先解决冲突。"},
  "Language": {
    "fa": "زبان",
    "ar": "اللغة",
    "zh": "语言"
  },
  "Local Git": {
    "fa": "گیت محلی",
    "ar": "Git المحلي",
    "zh": "本机 Git"
  },
  "Live": {
    "fa": "زنده",
    "ar": "مباشر",
    "zh": "实时"
  },
  "Paused": {
    "fa": "متوقف",
    "ar": "متوقف",
    "zh": "已暂停"
  },
  "Live monitoring": {
    "fa": "پایش زنده",
    "ar": "المراقبة المباشرة",
    "zh": "实时监控"
  },
  "Add workspace": {
    "fa": "افزودن ورک‌اسپیس",
    "ar": "إضافة مساحة عمل",
    "zh": "添加工作区"
  },
  "Appearance": {
    "fa": "ظاهر",
    "ar": "المظهر",
    "zh": "外观"
  },
  "Something needs attention": {
    "fa": "نیاز به بررسی",
    "ar": "يحتاج إلى مراجعة",
    "zh": "有项目需要处理"
  },
  "Notice": {
    "fa": "اعلان",
    "ar": "تنبيه",
    "zh": "提示"
  },
  "Dismiss message": {
    "fa": "بستن پیام",
    "ar": "إغلاق الرسالة",
    "zh": "关闭消息"
  },
  "Open the desktop app": {
    "fa": "برنامهٔ دسکتاپ را باز کنید",
    "ar": "افتح تطبيق سطح المكتب",
    "zh": "打开桌面应用"
  },
  "GitOrbit needs the desktop app to access local folders and Git.": {
    "fa": "برای دسترسی به پوشه‌های محلی و گیت، برنامهٔ دسکتاپ GitOrbit را باز کنید.",
    "ar": "افتح تطبيق GitOrbit لسطح المكتب للوصول إلى المجلدات المحلية وGit.",
    "zh": "请使用 GitOrbit 桌面应用访问本地文件夹和 Git。"
  },
  "Checking Git and restoring workspaces…": {
    "fa": "در حال بررسی گیت و بازیابی ورک‌اسپیس‌ها…",
    "ar": "جارٍ التحقق من Git واستعادة مساحات العمل…",
    "zh": "正在检查 Git 并恢复工作区…"
  },
  "Install Git to get started": {
    "fa": "برای شروع، گیت را نصب کنید",
    "ar": "ثبّت Git للبدء",
    "zh": "安装 Git 后即可开始"
  },
  "Git was not found on this computer. Install it once to monitor all your workspaces.": {
    "fa": "گیت روی این سیستم پیدا نشد. برای پایش ورک‌اسپیس‌ها، آن را نصب کنید.",
    "ar": "لم يتم العثور على Git على هذا الجهاز. ثبّته لمراقبة مساحات عملك.",
    "zh": "未在这台电脑上找到 Git。安装后即可监控所有工作区。"
  },
  "Check Git availability and try again.": {
    "fa": "نصب گیت را بررسی کنید و دوباره تلاش کنید.",
    "ar": "تحقق من تثبيت Git وحاول مجددًا.",
    "zh": "请检查 Git 是否可用，然后重试。"
  },
  "Installing Git…": {
    "fa": "در حال نصب گیت…",
    "ar": "جارٍ تثبيت Git…",
    "zh": "正在安装 Git…"
  },
  "Install Git": {
    "fa": "نصب گیت",
    "ar": "تثبيت Git",
    "zh": "安装 Git"
  },
  "Download Git": {
    "fa": "دانلود گیت",
    "ar": "تنزيل Git",
    "zh": "下载 Git"
  },
  "Check again": {
    "fa": "بررسی مجدد",
    "ar": "تحقق مجددًا",
    "zh": "重新检查"
  },
  "Your operating system handles any installation permissions.": {
    "fa": "مجوزهای نصب از طریق سیستم‌عامل درخواست می‌شوند.",
    "ar": "يتولى نظام التشغيل طلب أذونات التثبيت.",
    "zh": "安装所需的权限由操作系统处理。"
  },
  "Your workspaces, at a glance": {
    "fa": "ورک‌اسپیس‌ها در یک نگاه",
    "ar": "مساحات عملك في لمحة",
    "zh": "一眼掌握工作区状态"
  },
  "Choose a folder containing your Git projects. Add more folders as tabs and monitor them together.": {
    "fa": "پوشهٔ پروژه‌های گیت را انتخاب کنید. پوشه‌های دیگر را در تب‌های جدا اضافه و هم‌زمان پایش کنید.",
    "ar": "اختر مجلد مشاريع Git. أضف مجلدات أخرى في علامات تبويب منفصلة وراقبها معًا.",
    "zh": "选择包含 Git 项目的文件夹。添加更多文件夹作为标签页，同时监控多个工作区。"
  },
  "Add your first workspace": {
    "fa": "افزودن اولین ورک‌اسپیس",
    "ar": "إضافة أول مساحة عمل",
    "zh": "添加第一个工作区"
  },
  "Search repositories": {
    "fa": "جست‌وجوی ریپوها",
    "ar": "البحث في المستودعات",
    "zh": "搜索仓库"
  },
  "Find a repository…": {
    "fa": "جست‌وجوی ریپو…",
    "ar": "ابحث عن مستودع…",
    "zh": "查找仓库…"
  },
  "Repository filter": {
    "fa": "فیلتر ریپوها",
    "ar": "تصفية المستودعات",
    "zh": "仓库筛选"
  },
  "Needs attention": {
    "fa": "نیازمند بررسی",
    "ar": "تحتاج إلى مراجعة",
    "zh": "需要处理"
  },
  "All repositories": {
    "fa": "همهٔ ریپوها",
    "ar": "كل المستودعات",
    "zh": "所有仓库"
  },
  "Auto fetch": {
    "fa": "فچ خودکار",
    "ar": "الجلب التلقائي",
    "zh": "自动获取"
  },
  "Auto fetch remotes": {
    "fa": "فچ خودکار ریموت‌ها",
    "ar": "جلب التحديثات البعيدة تلقائيًا",
    "zh": "自动获取远程更新"
  },
  "every 60s": {
    "fa": "هر ۶۰ ثانیه",
    "ar": "كل ٦٠ ثانية",
    "zh": "每 60 秒"
  },
  "Fetch remotes": {
    "fa": "فچ ریموت‌ها",
    "ar": "جلب التحديثات البعيدة",
    "zh": "获取远程更新"
  },
  "Refresh status": {
    "fa": "تازه‌سازی وضعیت",
    "ar": "تحديث الحالة",
    "zh": "刷新状态"
  },
  "Pulling…": {
    "fa": "در حال پول…",
    "ar": "جارٍ السحب…",
    "zh": "正在拉取…"
  },
  "Pull all": {
    "fa": "پول همه",
    "ar": "سحب الكل",
    "zh": "全部拉取"
  },
  "Status unavailable": {
    "fa": "وضعیت در دسترس نیست",
    "ar": "الحالة غير متاحة",
    "zh": "状态不可用"
  },
  "Previous results may be outdated.": {
    "fa": "ممکن است نتایج قبلی به‌روز نباشند.",
    "ar": "قد تكون النتائج السابقة قديمة.",
    "zh": "之前的结果可能已过期。"
  },
  "Some folders could not be scanned": {
    "fa": "برخی پوشه‌ها بررسی نشدند",
    "ar": "تعذر فحص بعض المجلدات",
    "zh": "部分文件夹无法扫描"
  },
  "Repository": {
    "fa": "ریپو",
    "ar": "المستودع",
    "zh": "仓库"
  },
  "Branch": {
    "fa": "شاخه",
    "ar": "الفرع",
    "zh": "分支"
  },
  "Changes": {
    "fa": "تغییرات",
    "ar": "التغييرات",
    "zh": "更改"
  },
  "Push": {
    "fa": "پوش",
    "ar": "الدفع",
    "zh": "推送"
  },
  "Pull": {
    "fa": "پول",
    "ar": "السحب",
    "zh": "拉取"
  },
  "Next": {
    "fa": "اقدام بعدی",
    "ar": "الخطوة التالية",
    "zh": "下一步"
  },
  "Open folder": {
    "fa": "باز کردن پوشه",
    "ar": "فتح المجلد",
    "zh": "打开文件夹"
  },
  "Detached HEAD": {
    "fa": "HEAD جداشده",
    "ar": "HEAD منفصل",
    "zh": "分离的 HEAD"
  },
  "No tracked upstream count": {
    "fa": "تعداد کامیت‌های upstream مشخص نیست",
    "ar": "عدد التزامات الفرع المتتبّع غير معروف",
    "zh": "无法确定上游提交数量"
  },
  "Commits ahead of upstream": {
    "fa": "کامیت‌های آمادهٔ پوش",
    "ar": "التزامات جاهزة للدفع",
    "zh": "领先上游的提交"
  },
  "Commits behind upstream": {
    "fa": "کامیت‌های آمادهٔ پول",
    "ar": "التزامات جاهزة للسحب",
    "zh": "落后上游的提交"
  },
  "No Git repositories found in this folder.": {
    "fa": "ریپوی گیت در این پوشه پیدا نشد.",
    "ar": "لم يتم العثور على مستودعات Git في هذا المجلد.",
    "zh": "此文件夹中未找到 Git 仓库。"
  },
  "No repositories match your search.": {
    "fa": "ریپویی مطابق جست‌وجو پیدا نشد.",
    "ar": "لا توجد مستودعات تطابق بحثك.",
    "zh": "没有符合搜索条件的仓库。"
  },
  "All repositories are up to date.": {
    "fa": "همهٔ ریپوها به‌روز هستند.",
    "ar": "كل المستودعات محدّثة.",
    "zh": "所有仓库均已更新。"
  },
  "Status": {
    "fa": "وضعیت",
    "ar": "الحالة",
    "zh": "状态"
  },
  "Remotes": {
    "fa": "ریموت‌ها",
    "ar": "المستودعات البعيدة",
    "zh": "远程"
  },
  "Click a repository for its Git graph, files, or outgoing commits": {
    "fa": "برای دیدن نقشهٔ گیت، فایل‌ها و کامیت‌های خروجی، روی ریپو کلیک کنید",
    "ar": "انقر على مستودع لعرض مخطط Git والملفات والالتزامات الصادرة",
    "zh": "点击仓库查看 Git 图、文件或待推送提交"
  },
  "? = no upstream count": {
    "fa": "؟ = تعداد کامیت‌های upstream مشخص نیست",
    "ar": "؟ = عدد التزامات الفرع المتتبّع غير معروف",
    "zh": "? = 无法确定上游数量"
  },
  "Local changes live · Remote counts update on fetch": {
    "fa": "تغییرات محلی زنده · شمارش ریموت با فچ به‌روز می‌شود",
    "ar": "تغييرات محلية مباشرة · تُحدَّث أعداد التزامات المستودعات البعيدة عند الجلب",
    "zh": "本地更改实时更新 · 获取远程更新后刷新远程数量"
  },
  "Resize repository details panel": {
    "fa": "تغییر اندازهٔ پنل جزئیات ریپو",
    "ar": "تغيير حجم لوحة تفاصيل المستودع",
    "zh": "调整仓库详情面板大小"
  },
  "Drag to resize · use arrow keys to adjust": {
    "fa": "برای تغییر اندازه بکشید یا از کلیدهای جهت استفاده کنید",
    "ar": "اسحب لتغيير الحجم أو استخدم مفاتيح الأسهم",
    "zh": "拖动调整大小 · 也可使用方向键"
  },
  "No upstream": {
    "fa": "بدون upstream",
    "ar": "لا يوجد فرع متتبّع",
    "zh": "未设置上游"
  },
  "Pull repository": {
    "fa": "پول ریپو",
    "ar": "سحب المستودع",
    "zh": "拉取此仓库"
  },
  "Git graph": {
    "fa": "نقشهٔ گیت",
    "ar": "مخطط Git",
    "zh": "Git 图"
  },
  "Version Control": {
    "fa": "کنترل نسخه",
    "ar": "التحكم بالإصدارات",
    "zh": "版本控制"
  },
  "Pull results": {
    "fa": "نتایج پول",
    "ar": "نتائج السحب",
    "zh": "拉取结果"
  },
  "Fast-forward updates. Repositories with local changes, no upstream, or divergent history need attention.": {
    "fa": "به‌روزرسانی با fast-forward انجام می‌شود. ریپوهای دارای تغییر محلی، بدون upstream یا با تاریخچهٔ واگرا نیاز به بررسی دارند.",
    "ar": "التحديث بطريقة fast-forward. تحتاج المستودعات ذات التغييرات المحلية أو دون فرع متتبّع أو بتاريخ متشعب إلى مراجعة.",
    "zh": "仅快进更新。有本地更改、未设置上游或历史分叉的仓库需要处理。"
  },
  "Updating repositories…": {
    "fa": "در حال به‌روزرسانی ریپوها…",
    "ar": "جارٍ تحديث المستودعات…",
    "zh": "正在更新仓库…"
  },
  "Close": {
    "fa": "بستن",
    "ar": "إغلاق",
    "zh": "关闭"
  },
  "Not yet": {
    "fa": "هنوز انجام نشده",
    "ar": "لم يحدث بعد",
    "zh": "尚未执行"
  },
  "Check Git": {
    "fa": "بررسی گیت",
    "ar": "التحقق من Git",
    "zh": "检查 Git"
  },
  "Resolve": {
    "fa": "رفع تداخل",
    "ar": "حل التعارضات",
    "zh": "解决冲突"
  },
  "Retry fetch": {
    "fa": "فچ مجدد",
    "ar": "إعادة الجلب",
    "zh": "重试获取"
  },
  "Select branch": {
    "fa": "انتخاب شاخه",
    "ar": "اختيار الفرع",
    "zh": "选择分支"
  },
  "Sync branch": {
    "fa": "همگام‌سازی شاخه",
    "ar": "مزامنة الفرع",
    "zh": "同步分支"
  },
  "Commit": {
    "fa": "کامیت",
    "ar": "التزام",
    "zh": "提交"
  },
  "Set upstream": {
    "fa": "تنظیم upstream",
    "ar": "تعيين الفرع المتتبّع",
    "zh": "设置上游"
  },
  "Check upstream": {
    "fa": "بررسی upstream",
    "ar": "فحص الفرع المتتبّع",
    "zh": "检查上游"
  },
  "Clean": {
    "fa": "بدون تغییر",
    "ar": "دون تغييرات",
    "zh": "无更改"
  },
  "Mode": {
    "fa": "حالت",
    "ar": "الوضع",
    "zh": "模式"
  },
  "Make the workspace feel like yours. Changes are saved automatically.": {
    "fa": "ظاهر برنامه را شخصی‌سازی کنید. تغییرات خودکار ذخیره می‌شوند.",
    "ar": "خصّص مظهر التطبيق. تُحفظ التغييرات تلقائيًا.",
    "zh": "自定义应用外观，更改会自动保存。"
  },
  "Light": {
    "fa": "روشن",
    "ar": "فاتح",
    "zh": "浅色"
  },
  "Dark": {
    "fa": "تیره",
    "ar": "داكن",
    "zh": "深色"
  },
  "System": {
    "fa": "سیستم",
    "ar": "النظام",
    "zh": "跟随系统"
  },
  "Palette": {
    "fa": "پالت رنگ",
    "ar": "لوحة الألوان",
    "zh": "配色"
  },
  "Neutral": {
    "fa": "خنثی",
    "ar": "محايد",
    "zh": "中性"
  },
  "Violet": {
    "fa": "بنفش",
    "ar": "بنفسجي",
    "zh": "紫罗兰"
  },
  "Ocean": {
    "fa": "اقیانوس",
    "ar": "محيط",
    "zh": "海洋"
  },
  "Forest": {
    "fa": "جنگل",
    "ar": "غابة",
    "zh": "森林"
  },
  "Custom accent": {
    "fa": "رنگ دلخواه",
    "ar": "لون مخصص",
    "zh": "自定义强调色"
  },
  "Custom accent color": {
    "fa": "رنگ تأکیدی دلخواه",
    "ar": "لون التمييز المخصص",
    "zh": "自定义强调色"
  },
  "Palette default": {
    "fa": "پیش‌فرض پالت",
    "ar": "اللون الافتراضي للوحة",
    "zh": "默认配色"
  },
  "Reset color": {
    "fa": "بازنشانی رنگ",
    "ar": "إعادة ضبط اللون",
    "zh": "重置颜色"
  },
  "Reset appearance": {
    "fa": "بازنشانی ظاهر",
    "ar": "إعادة ضبط المظهر",
    "zh": "重置外观"
  },
  "History scope": {
    "fa": "محدودهٔ تاریخچه",
    "ar": "نطاق السجل",
    "zh": "历史范围"
  },
  "All branches": {
    "fa": "همهٔ شاخه‌ها",
    "ar": "كل الفروع",
    "zh": "所有分支"
  },
  "Current HEAD": {
    "fa": "HEAD فعلی",
    "ar": "HEAD الحالي",
    "zh": "当前 HEAD"
  },
  "Reading history…": {
    "fa": "در حال خواندن تاریخچه…",
    "ar": "جارٍ قراءة السجل…",
    "zh": "正在读取历史…"
  },
  "Refresh history": {
    "fa": "تازه‌سازی تاریخچه",
    "ar": "تحديث السجل",
    "zh": "刷新历史"
  },
  "Refresh": {
    "fa": "تازه‌سازی",
    "ar": "تحديث",
    "zh": "刷新"
  },
  "Could not read Git history": {
    "fa": "تاریخچهٔ گیت خوانده نشد",
    "ar": "تعذرت قراءة سجل Git",
    "zh": "无法读取 Git 历史"
  },
  "Shallow clone: only locally available history is shown.": {
    "fa": "کلون کم‌عمق است؛ فقط تاریخچهٔ موجود روی سیستم نمایش داده می‌شود.",
    "ar": "نسخة سطحية: يُعرض السجل المتاح محليًا فقط.",
    "zh": "浅克隆：仅显示本地可用的历史。"
  },
  "Loading commit graph…": {
    "fa": "در حال بارگذاری نقشهٔ کامیت‌ها…",
    "ar": "جارٍ تحميل مخطط الالتزامات…",
    "zh": "正在加载提交图…"
  },
  "No commits in this history yet.": {
    "fa": "این تاریخچه هنوز کامیتی ندارد.",
    "ar": "لا توجد التزامات في هذا السجل بعد.",
    "zh": "此历史中尚无提交。"
  },
  "Git commit graph": {
    "fa": "نقشهٔ کامیت‌های گیت",
    "ar": "مخطط التزامات Git",
    "zh": "Git 提交图"
  },
  "Graph": {
    "fa": "نقشه",
    "ar": "المخطط",
    "zh": "图"
  },
  "Commit message": {
    "fa": "پیام کامیت",
    "ar": "رسالة الالتزام",
    "zh": "提交说明"
  },
  "Commit Message": {
    "fa": "پیام کامیت",
    "ar": "رسالة الالتزام",
    "zh": "提交说明"
  },
  "Author": {
    "fa": "نویسنده",
    "ar": "المؤلف",
    "zh": "作者"
  },
  "Date": {
    "fa": "تاریخ",
    "ar": "التاريخ",
    "zh": "日期"
  },
  "Untitled commit": {
    "fa": "کامیت بدون عنوان",
    "ar": "التزام دون عنوان",
    "zh": "无标题提交"
  },
  "Merge commit": {
    "fa": "کامیت ادغام",
    "ar": "التزام دمج",
    "zh": "合并提交"
  },
  "Showing the latest 5,000 commits": {
    "fa": "نمایش ۵٬۰۰۰ کامیت آخر",
    "ar": "عرض آخر ٥٬٠٠٠ التزام",
    "zh": "显示最近 5,000 条提交"
  },
  "Loading…": {
    "fa": "در حال بارگذاری…",
    "ar": "جارٍ التحميل…",
    "zh": "正在加载…"
  },
  "Load 200 more commits": {
    "fa": "نمایش ۲۰۰ کامیت دیگر",
    "ar": "عرض ٢٠٠ التزام إضافي",
    "zh": "再加载 200 条提交"
  },
  "Root commit": {
    "fa": "کامیت ریشه",
    "ar": "الالتزام الأول",
    "zh": "初始提交"
  },
  "Newest first · Lines follow commit parents · Branches and tags reflect local refs": {
    "fa": "جدیدترین‌ها در ابتدا · خطوط بر اساس والدهای کامیت · شاخه‌ها و تگ‌های محلی",
    "ar": "الأحدث أولًا · تتبع الخطوط آباء الالتزامات · الفروع والوسوم المحلية",
    "zh": "最新提交在前 · 连线依据父提交 · 分支和标签来自本地引用"
  },
  "(no commit message)": {
    "fa": "(بدون پیام کامیت)",
    "ar": "(دون رسالة التزام)",
    "zh": "（无提交说明）"
  },
  "Added": {
    "fa": "اضافه‌شده",
    "ar": "مضاف",
    "zh": "新增"
  },
  "Deleted": {
    "fa": "حذف‌شده",
    "ar": "محذوف",
    "zh": "删除"
  },
  "Renamed": {
    "fa": "تغییر نام",
    "ar": "أعيدت تسميته",
    "zh": "重命名"
  },
  "Copied": {
    "fa": "کپی‌شده",
    "ar": "منسوخ",
    "zh": "复制"
  },
  "Type changed": {
    "fa": "تغییر نوع",
    "ar": "تغيّر النوع",
    "zh": "类型更改"
  },
  "Modified": {
    "fa": "ویرایش‌شده",
    "ar": "معدّل",
    "zh": "修改"
  },
  "Reading the push destination…": {
    "fa": "در حال خواندن مقصد پوش…",
    "ar": "جارٍ قراءة وجهة الدفع…",
    "zh": "正在读取推送目标…"
  },
  "No upstream branch is configured.": {
    "fa": "شاخهٔ upstream تنظیم نشده است.",
    "ar": "لم يتم تعيين فرع متتبّع.",
    "zh": "尚未配置上游分支。"
  },
  "Refresh outgoing commits": {
    "fa": "تازه‌سازی کامیت‌های خروجی",
    "ar": "تحديث الالتزامات الصادرة",
    "zh": "刷新待推送提交"
  },
  "Pushing…": {
    "fa": "در حال پوش…",
    "ar": "جارٍ الدفع…",
    "zh": "正在推送…"
  },
  "Outgoing commits": {
    "fa": "کامیت‌های خروجی",
    "ar": "الالتزامات الصادرة",
    "zh": "待推送提交"
  },
  "Reading commits…": {
    "fa": "در حال خواندن کامیت‌ها…",
    "ar": "جارٍ قراءة الالتزامات…",
    "zh": "正在读取提交…"
  },
  "Nothing to push. This branch matches its tracked remote.": {
    "fa": "کامیتی برای پوش وجود ندارد. این شاخه با ریموت خود همگام است.",
    "ar": "لا توجد التزامات للدفع. هذا الفرع يطابق الفرع البعيد المتتبّع.",
    "zh": "没有可推送的提交。此分支与跟踪的远程分支一致。"
  },
  "Set an upstream branch to see and push outgoing commits.": {
    "fa": "برای دیدن و پوش کامیت‌های خروجی، شاخهٔ upstream را تنظیم کنید.",
    "ar": "عيّن فرعًا متتبّعًا لعرض الالتزامات الصادرة ودفعها.",
    "zh": "设置上游分支后即可查看并推送待推送提交。"
  },
  "Files in selected commit": {
    "fa": "فایل‌های کامیت انتخاب‌شده",
    "ar": "ملفات الالتزام المحدد",
    "zh": "所选提交中的文件"
  },
  "Changed files": {
    "fa": "فایل‌های تغییرکرده",
    "ar": "الملفات المتغيرة",
    "zh": "更改的文件"
  },
  "Reading changed files…": {
    "fa": "در حال خواندن فایل‌های تغییرکرده…",
    "ar": "جارٍ قراءة الملفات المتغيرة…",
    "zh": "正在读取更改的文件…"
  },
  "No file changes in this commit.": {
    "fa": "این کامیت تغییر فایلی ندارد.",
    "ar": "لا توجد تغييرات ملفات في هذا الالتزام.",
    "zh": "此提交没有文件更改。"
  },
  "Create a commit first, then review it here before pushing.": {
    "fa": "ابتدا کامیت بسازید، سپس پیش از پوش آن را اینجا بررسی کنید.",
    "ar": "أنشئ التزامًا أولًا ثم راجعه هنا قبل الدفع.",
    "zh": "先创建提交，再在此处检查后推送。"
  },
  "Push sends the listed commits to the tracked branch. Uncommitted changes stay on this machine and are not included.": {
    "fa": "پوش، کامیت‌های فهرست‌شده را به شاخهٔ ریموت می‌فرستد. تغییرات کامیت‌نشده روی سیستم می‌مانند و ارسال نمی‌شوند.",
    "ar": "يرسل الدفع الالتزامات المعروضة إلى الفرع المتتبّع. تبقى التغييرات غير الملتزم بها على هذا الجهاز ولا تُرسل.",
    "zh": "推送会将列表中的提交发送到跟踪的分支。未提交的更改保留在本机，不会被推送。"
  },
  "Stage selected": {
    "fa": "استیج انتخاب‌شده‌ها",
    "ar": "تجهيز المحدد",
    "zh": "暂存所选文件"
  },
  "Unstage selected": {
    "fa": "خارج‌کردن انتخاب‌شده‌ها از استیج",
    "ar": "إلغاء تجهيز المحدد",
    "zh": "取消暂存所选文件"
  },
  "Refresh files": {
    "fa": "تازه‌سازی فایل‌ها",
    "ar": "تحديث الملفات",
    "zh": "刷新文件"
  },
  "Staged": {
    "fa": "استیج‌شده",
    "ar": "مجهّزة",
    "zh": "已暂存"
  },
  "Unversioned Files": {
    "fa": "فایل‌های ردیابی‌نشده",
    "ar": "ملفات غير متتبّعة",
    "zh": "未跟踪文件"
  },
  "Working tree clean.": {
    "fa": "درخت کاری بدون تغییر است.",
    "ar": "شجرة العمل دون تغييرات.",
    "zh": "工作区无更改。"
  },
  "Commit options": {
    "fa": "تنظیمات کامیت",
    "ar": "خيارات الالتزام",
    "zh": "提交选项"
  },
  "Keep message after commit": {
    "fa": "حفظ پیام پس از کامیت",
    "ar": "الاحتفاظ بالرسالة بعد الالتزام",
    "zh": "提交后保留说明"
  },
  "Configure an upstream branch to commit and push.": {
    "fa": "برای کامیت و پوش، شاخهٔ upstream را تنظیم کنید.",
    "ar": "عيّن فرعًا متتبّعًا للالتزام والدفع.",
    "zh": "配置上游分支后即可提交并推送。"
  },
  "Pull incoming commits before pushing.": {
    "fa": "قبل از پوش، کامیت‌های ورودی را پول کنید.",
    "ar": "اسحب الالتزامات الواردة قبل الدفع.",
    "zh": "推送前请先拉取远程提交。"
  },
  "Commit and Push…": {
    "fa": "کامیت و پوش…",
    "ar": "الالتزام والدفع…",
    "zh": "提交并推送…"
  },
  "HEAD → Index": {
    "fa": "HEAD ← استیج",
    "ar": "HEAD ← منطقة التجهيز",
    "zh": "HEAD → 暂存区"
  },
  "Index → Working tree": {
    "fa": "استیج ← درخت کاری",
    "ar": "منطقة التجهيز ← شجرة العمل",
    "zh": "暂存区 → 工作目录"
  },
  "File diff": {
    "fa": "تفاوت فایل",
    "ar": "فروق الملف",
    "zh": "文件差异"
  },
  "Loading diff…": {
    "fa": "در حال بارگذاری تفاوت‌ها…",
    "ar": "جارٍ تحميل الفروق…",
    "zh": "正在加载差异…"
  },
  "No text difference in this view.": {
    "fa": "تفاوت متنی در این نما وجود ندارد.",
    "ar": "لا توجد فروق نصية في هذا العرض.",
    "zh": "此视图中没有文本差异。"
  },
  "Select a file to review its diff.": {
    "fa": "برای دیدن تفاوت‌ها، فایلی را انتخاب کنید.",
    "ar": "اختر ملفًا لمراجعة فروقه.",
    "zh": "选择文件以查看差异。"
  },
  "Stage your selection, then commit the staged files.": {
    "fa": "فایل‌های انتخاب‌شده را استیج کنید، سپس کامیت بزنید.",
    "ar": "جهّز الملفات المحددة ثم أنشئ التزامًا بالملفات المجهّزة.",
    "zh": "暂存所选文件，然后提交已暂存的文件。"
  },
  "Index": {
    "fa": "استیج",
    "ar": "منطقة التجهيز",
    "zh": "暂存区"
  },
  "Index · staged": {
    "fa": "استیج · آمادهٔ کامیت",
    "ar": "منطقة التجهيز · جاهز للالتزام",
    "zh": "暂存区 · 已暂存"
  },
  "Working tree": {
    "fa": "درخت کاری",
    "ar": "شجرة العمل",
    "zh": "工作目录"
  },
  "New file contents": {
    "fa": "محتوای فایل جدید",
    "ar": "محتوى الملف الجديد",
    "zh": "新文件内容"
  },
  "Side-by-side diff": {
    "fa": "تفاوت کنار هم",
    "ar": "فروق جنبًا إلى جنب",
    "zh": "并排差异"
  },
  "New file ·": {
    "fa": "فایل جدید ·",
    "ar": "ملف جديد ·",
    "zh": "新文件 ·"
  },
  "Preview truncated at 512 KB.": {
    "fa": "پیش‌نمایش در ۵۱۲ کیلوبایت محدود شده است.",
    "ar": "حُدّت المعاينة عند ٥١٢ كيلوبايت.",
    "zh": "预览在 512 KB 处截断。"
  },
  "App updates": {
    "fa": "به‌روزرسانی برنامه",
    "ar": "تحديثات التطبيق",
    "zh": "应用更新"
  },
  "Updates": {
    "fa": "به‌روزرسانی",
    "ar": "التحديثات",
    "zh": "更新"
  },
  "Update available": {
    "fa": "نسخهٔ جدید موجود است",
    "ar": "يتوفر تحديث",
    "zh": "有可用更新"
  },
  "Checking for updates…": {
    "fa": "در حال بررسی به‌روزرسانی…",
    "ar": "جارٍ التحقق من التحديثات…",
    "zh": "正在检查更新…"
  },
  "Download and install the signed release, then restart. Your workspaces and appearance settings are kept.": {
    "fa": "نسخهٔ امضاشده را دانلود و نصب کنید، سپس برنامه دوباره اجرا می‌شود. ورک‌اسپیس‌ها و تنظیمات ظاهر حفظ می‌شوند.",
    "ar": "نزّل الإصدار الموقّع وثبّته ثم أعد التشغيل. تُحفظ مساحات العمل وإعدادات المظهر.",
    "zh": "下载并安装经过签名的版本，然后重启。工作区和外观设置将保留。"
  },
  "Update download": {
    "fa": "دانلود به‌روزرسانی",
    "ar": "تنزيل التحديث",
    "zh": "更新下载"
  },
  "Verifying and installing…": {
    "fa": "در حال بررسی امضا و نصب…",
    "ar": "جارٍ التحقق والتثبيت…",
    "zh": "正在验证并安装…"
  },
  "Restarting…": {
    "fa": "در حال اجرای مجدد…",
    "ar": "جارٍ إعادة التشغيل…",
    "zh": "正在重启…"
  },
  "Wait for the current Git operation to finish before updating.": {
    "fa": "قبل از به‌روزرسانی، منتظر پایان عملیات گیت بمانید.",
    "ar": "انتظر انتهاء عملية Git الحالية قبل التحديث.",
    "zh": "请等待当前 Git 操作完成后再更新。"
  },
  "Update & restart": {
    "fa": "به‌روزرسانی و اجرای مجدد",
    "ar": "التحديث وإعادة التشغيل",
    "zh": "更新并重启"
  },
  "You are up to date.": {
    "fa": "برنامه به‌روز است.",
    "ar": "التطبيق محدّث.",
    "zh": "已是最新版本。"
  },
  "Check for a newer release.": {
    "fa": "وجود نسخهٔ جدید را بررسی کنید.",
    "ar": "تحقق من وجود إصدار أحدث.",
    "zh": "检查是否有新版本。"
  },
  "Not checked yet": {
    "fa": "هنوز بررسی نشده",
    "ar": "لم يُتحقق بعد",
    "zh": "尚未检查"
  },
  "Update connection": {
    "fa": "اتصال به‌روزرسانی",
    "ar": "اتصال التحديث",
    "zh": "更新连接"
  },
  "System proxy": {
    "fa": "پروکسی سیستم",
    "ar": "وكيل النظام",
    "zh": "系统代理"
  },
  "Direct connection": {
    "fa": "اتصال مستقیم",
    "ar": "اتصال مباشر",
    "zh": "直连"
  },
  "Applies only to update checks and downloads.": {
    "fa": "فقط برای بررسی و دانلود به‌روزرسانی استفاده می‌شود.",
    "ar": "يُستخدم فقط للتحقق من التحديثات وتنزيلها.",
    "zh": "仅用于检查和下载更新。"
  },
  "Scanning repositories…": {
    "fa": "در حال بررسی ریپوها…",
    "ar": "جارٍ فحص المستودعات…",
    "zh": "正在扫描仓库…"
  },
  "Status incomplete": {
    "fa": "وضعیت ناقص است",
    "ar": "الحالة غير مكتملة",
    "zh": "状态不完整"
  },
  "All up to date": {
    "fa": "همه به‌روز",
    "ar": "الكل محدّث",
    "zh": "全部已更新"
  },
  "Close {name}": {
    "fa": "بستن {name}",
    "ar": "إغلاق {name}",
    "zh": "关闭 {name}"
  },
  "Details for {name}": {
    "fa": "جزئیات {name}",
    "ar": "تفاصيل {name}",
    "zh": "{name} 的详情"
  },
  "Open {name} folder": {
    "fa": "باز کردن پوشهٔ {name}",
    "ar": "فتح مجلد {name}",
    "zh": "打开 {name} 文件夹"
  },
  "{count} repositories · {attention} need attention": {
    "fa": "{count} ریپو · {attention} نیازمند بررسی",
    "ar": "{count} مستودع · {attention} بحاجة إلى مراجعة",
    "zh": "{count} 个仓库 · {attention} 个需要处理"
  },
  "{count} workspaces": {
    "fa": "{count} ورک‌اسپیس",
    "ar": "{count} مساحة عمل",
    "zh": "{count} 个工作区"
  },
  "{count} commits": {
    "fa": "{count} کامیت",
    "ar": "{count} التزام",
    "zh": "{count} 条提交"
  },
  "Push {count} commits": {
    "fa": "پوش {count} کامیت",
    "ar": "دفع {count} التزام",
    "zh": "推送 {count} 条提交"
  },
  "The remote has {count} incoming commits. Fetch and pull before pushing.": {
    "fa": "ریموت {count} کامیت ورودی دارد. قبل از پوش، فچ و پول کنید.",
    "ar": "يحتوي المستودع البعيد على {count} التزام وارد. اجلب واسحب قبل الدفع.",
    "zh": "远程有 {count} 条待拉取提交。推送前请先获取并拉取。"
  },
  "Showing {shown} of {total} commits; Push will include all outgoing commits.": {
    "fa": "نمایش {shown} از {total} کامیت؛ پوش همهٔ کامیت‌های خروجی را ارسال می‌کند.",
    "ar": "عرض {shown} من {total} التزام؛ يشمل الدفع كل الالتزامات الصادرة.",
    "zh": "显示 {total} 条提交中的 {shown} 条；推送将包含所有待推送提交。"
  },
  "Parents: {parents}": {
    "fa": "والدها: {parents}",
    "ar": "الآباء: {parents}",
    "zh": "父提交：{parents}"
  },
  "Select all {group}": {
    "fa": "انتخاب همهٔ {group}",
    "ar": "تحديد كل {group}",
    "zh": "选择全部{group}"
  },
  "Select {group} {path}": {
    "fa": "انتخاب {path} از {group}",
    "ar": "تحديد {path} من {group}",
    "zh": "选择{group}中的 {path}"
  },
  "{count} staged": {
    "fa": "{count} استیج‌شده",
    "ar": "{count} مجهّزة",
    "zh": "{count} 个已暂存"
  },
  "{label} version": {
    "fa": "نسخهٔ {label}",
    "ar": "نسخة {label}",
    "zh": "{label}版本"
  },
  "{label} code": {
    "fa": "کد {label}",
    "ar": "شفرة {label}",
    "zh": "{label}代码"
  },
  "Update available: {version}": {
    "fa": "نسخهٔ جدید: {version}",
    "ar": "تحديث متاح: {version}",
    "zh": "有可用更新：{version}"
  },
  "Update {version}": {
    "fa": "به‌روزرسانی {version}",
    "ar": "تحديث {version}",
    "zh": "更新至 {version}"
  },
  "Current version: {version}. Updates are checked at startup and every six hours.": {
    "fa": "نسخهٔ فعلی: {version}. به‌روزرسانی هنگام اجرا و هر شش ساعت بررسی می‌شود.",
    "ar": "الإصدار الحالي: {version}. يُتحقق من التحديثات عند بدء التشغيل وكل ست ساعات.",
    "zh": "当前版本：{version}。启动时和每六小时检查一次更新。"
  },
  "Last checked {time}": {
    "fa": "آخرین بررسی: {time}",
    "ar": "آخر تحقق: {time}",
    "zh": "上次检查：{time}"
  },
  "Downloading… {progress}": {
    "fa": "در حال دانلود… {progress}",
    "ar": "جارٍ التنزيل… {progress}",
    "zh": "正在下载… {progress}"
  },
  "Update failed: {error}": {
    "fa": "به‌روزرسانی ناموفق بود: {error}",
    "ar": "فشل التحديث: {error}",
    "zh": "更新失败：{error}"
  },
  "Commit created, but push failed: {error}": {
    "fa": "کامیت ساخته شد، اما پوش ناموفق بود: {error}",
    "ar": "أُنشئ الالتزام، لكن الدفع فشل: {error}",
    "zh": "提交已创建，但推送失败：{error}"
  },
  "There are no outgoing commits to push.": {
    "fa": "کامیت خروجی برای پوش وجود ندارد.",
    "ar": "لا توجد التزامات صادرة للدفع.",
    "zh": "没有待推送的提交。"
  },
  "Pull · {name}": {
    "fa": "پول · {name}",
    "ar": "السحب · {name}",
    "zh": "拉取 · {name}"
  },
  "Updated": {
    "fa": "به‌روز شد",
    "ar": "تم التحديث",
    "zh": "已更新"
  },
  "Skipped": {
    "fa": "رد شد",
    "ar": "تم التجاوز",
    "zh": "已跳过"
  },
  "Failed": {
    "fa": "ناموفق",
    "ar": "فشل",
    "zh": "失败"
  },
  "{done}/{total} processed · {updated} updated · {skipped} skipped · {failed} failed": {
    "fa": "{done} از {total} بررسی‌شده · {updated} به‌روز · {skipped} ردشده · {failed} ناموفق",
    "ar": "عولج {done} من {total} · حُدّث {updated} · تُجاوز {skipped} · فشل {failed}",
    "zh": "已处理 {done}/{total} · {updated} 个已更新 · {skipped} 个已跳过 · {failed} 个失败"
  },
  "{width}% of window width": {
    "fa": "{width}٪ از عرض پنجره",
    "ar": "{width}٪ من عرض النافذة",
    "zh": "窗口宽度的 {width}%"
  },
  "{count} repositories": {
    "fa": "{count} ریپو",
    "ar": "المستودعات: {count}",
    "zh": "{count} 个仓库"
  },
  "{count} need attention": {
    "fa": "{count} نیازمند بررسی",
    "ar": "تحتاج إلى مراجعة: {count}",
    "zh": "{count} 个需要处理"
  },
  "{count} workspace": {
    "fa": "{count} ورک‌اسپیس",
    "ar": "مساحات العمل: {count}",
    "zh": "{count} 个工作区"
  },
  "Push {count} commit": {
    "fa": "پوش {count} کامیت",
    "ar": "دفع الالتزامات ({count})",
    "zh": "推送 {count} 条提交"
  },
  "Status {time}": {
    "fa": "وضعیت {time}",
    "ar": "الحالة {time}",
    "zh": "状态 {time}"
  },
  "Remotes {time}": {
    "fa": "ریموت‌ها {time}",
    "ar": "المستودعات البعيدة {time}",
    "zh": "远程 {time}"
  },
  "staged": {
    "fa": "استیج‌شده",
    "ar": "المجهّزة",
    "zh": "已暂存文件"
  },
  "changes": {
    "fa": "تغییرات",
    "ar": "التغييرات",
    "zh": "更改"
  },
  "unversioned": {
    "fa": "فایل‌های ردیابی‌نشده",
    "ar": "الملفات غير المتتبّعة",
    "zh": "未跟踪文件"
  },
  "Download Git from the official website, install it, then check again.": {
    "fa": "گیت را از سایت رسمی دانلود و نصب کنید، سپس دوباره بررسی کنید.",
    "ar": "نزّل Git من الموقع الرسمي وثبّته، ثم تحقق مجددًا.",
    "zh": "从官方网站下载并安装 Git，然后重新检查。"
  },
  "Install Git using Windows Package Manager. Windows may ask for permission.": {
    "fa": "گیت با مدیر بستهٔ ویندوز نصب می‌شود. ممکن است ویندوز مجوز بخواهد.",
    "ar": "ثبّت Git باستخدام مدير حزم Windows. قد يطلب Windows إذنًا.",
    "zh": "使用 Windows 包管理器安装 Git。Windows 可能会请求权限。"
  },
  "Install Git using Homebrew.": {
    "fa": "نصب گیت با Homebrew.",
    "ar": "تثبيت Git باستخدام Homebrew.",
    "zh": "使用 Homebrew 安装 Git。"
  },
  "Open Apple's developer tools installer. Complete the system dialog, then check again.": {
    "fa": "نصاب ابزارهای توسعهٔ اپل را باز کنید. نصب را تکمیل کنید و دوباره بررسی کنید.",
    "ar": "افتح مثبّت أدوات تطوير Apple. أكمل نافذة النظام ثم تحقق مجددًا.",
    "zh": "打开 Apple 开发者工具安装程序。完成系统对话框中的操作，然后重新检查。"
  },
  "Install Git using your system package manager. A system authentication dialog may appear.": {
    "fa": "گیت با مدیر بستهٔ سیستم نصب می‌شود. ممکن است پنجرهٔ احراز هویت باز شود.",
    "ar": "ثبّت Git باستخدام مدير حزم النظام. قد تظهر نافذة مصادقة.",
    "zh": "使用系统包管理器安装 Git。可能会出现系统身份验证对话框。"
  },
  "Git is already installed.": {
    "fa": "گیت از قبل نصب شده است.",
    "ar": "Git مثبّت بالفعل.",
    "zh": "Git 已安装。"
  },
  "Automatic installation is unavailable. Use the official download page.": {
    "fa": "نصب خودکار در دسترس نیست. از صفحهٔ رسمی دانلود استفاده کنید.",
    "ar": "التثبيت التلقائي غير متاح. استخدم صفحة التنزيل الرسمية.",
    "zh": "自动安装不可用，请使用官方下载页面。"
  },
  "Complete the system installer, then select Check again.": {
    "fa": "نصب سیستم را تکمیل کنید و «بررسی دوباره» را بزنید.",
    "ar": "أكمل مثبّت النظام ثم اختر «تحقق مجددًا».",
    "zh": "完成系统安装程序，然后选择“重新检查”。"
  },
  "Git is ready.": {
    "fa": "گیت آماده است.",
    "ar": "Git جاهز.",
    "zh": "Git 已就绪。"
  },
  "The installer finished, but Git is not available yet. Complete any system prompts, then check again.": {
    "fa": "نصاب تمام شد اما گیت هنوز در دسترس نیست. پیام‌های سیستم را تکمیل کنید و دوباره بررسی کنید.",
    "ar": "انتهى المثبّت لكن Git غير متاح بعد. أكمل طلبات النظام ثم تحقق مجددًا.",
    "zh": "安装程序已完成，但 Git 尚不可用。请完成系统提示中的操作，然后重新检查。"
  },
  "Git is not installed.": {
    "fa": "گیت نصب نشده است.",
    "ar": "Git غير مثبّت.",
    "zh": "未安装 Git。"
  },
  "Git is not installed. Install Git to monitor workspaces.": {
    "fa": "گیت نصب نشده است. برای پایش ورک‌اسپیس‌ها گیت را نصب کنید.",
    "ar": "Git غير مثبّت. ثبّته لمراقبة مساحات العمل.",
    "zh": "未安装 Git。请安装 Git 以监控工作区。"
  },
  "Workspace folder is unavailable. Reconnect the drive or close this tab.": {
    "fa": "پوشهٔ ورک‌اسپیس در دسترس نیست. درایو را دوباره وصل کنید یا این تب را ببندید.",
    "ar": "مجلد مساحة العمل غير متاح. أعد توصيل القرص أو أغلق هذا التبويب.",
    "zh": "工作区文件夹不可用。请重新连接磁盘或关闭此标签页。"
  },
  "Workspace is no longer open": {
    "fa": "ورک‌اسپیس دیگر باز نیست",
    "ar": "مساحة العمل لم تعد مفتوحة",
    "zh": "工作区已关闭"
  },
  "Choose a repository inside the workspace.": {
    "fa": "یک ریپو داخل ورک‌اسپیس انتخاب کنید.",
    "ar": "اختر مستودعًا داخل مساحة العمل.",
    "zh": "请选择工作区内的仓库。"
  },
  "Command timed out. Check remote access and try again.": {
    "fa": "زمان اجرای فرمان تمام شد. دسترسی ریموت را بررسی کنید و دوباره امتحان کنید.",
    "ar": "انتهت مهلة الأمر. تحقق من الوصول إلى المستودع البعيد وحاول مجددًا.",
    "zh": "命令超时。请检查远程访问后重试。"
  },
  "Enter a commit message.": {
    "fa": "پیام کامیت را وارد کنید.",
    "ar": "أدخل رسالة الالتزام.",
    "zh": "请输入提交说明。"
  },
  "The commit message is too long.": {
    "fa": "پیام کامیت بیش از حد طولانی است.",
    "ar": "رسالة الالتزام طويلة جدًا.",
    "zh": "提交说明过长。"
  },
  "Stage files before committing.": {
    "fa": "قبل از کامیت فایل‌ها را استیج کنید.",
    "ar": "جهّز الملفات قبل الالتزام.",
    "zh": "提交前请先暂存文件。"
  },
  "Resolve and stage all conflicts before committing.": {
    "fa": "قبل از کامیت، همهٔ تداخل‌ها را رفع و استیج کنید.",
    "ar": "عالج جميع التعارضات وجهّزها قبل الالتزام.",
    "zh": "提交前请先解决并暂存所有冲突。"
  },
  "Select files to stage or unstage.": {
    "fa": "فایل‌های موردنظر برای استیج یا خارج‌کردن از استیج را انتخاب کنید.",
    "ar": "اختر ملفات لتجهيزها أو إلغاء تجهيزها.",
    "zh": "请选择需要暂存或取消暂存的文件。"
  },
  "Skipped: commit or stash local changes before pulling.": {
    "fa": "رد شد: قبل از پول، تغییرات محلی را کامیت یا استش کنید.",
    "ar": "تُجاوز: التزم بالتغييرات المحلية أو خزّنها مؤقتًا قبل السحب.",
    "zh": "已跳过：拉取前请先提交或储藏本地更改。"
  },
  "Skipped: select a branch before pulling.": {
    "fa": "رد شد: قبل از پول یک شاخه انتخاب کنید.",
    "ar": "تُجاوز: اختر فرعًا قبل السحب.",
    "zh": "已跳过：拉取前请先选择分支。"
  },
  "Skipped: configure an upstream before pulling.": {
    "fa": "رد شد: قبل از پول، upstream را تنظیم کنید.",
    "ar": "تُجاوز: اضبط الفرع المتتبّع قبل السحب.",
    "zh": "已跳过：拉取前请先配置上游。"
  },
  "Refresh the push list before pushing.": {
    "fa": "قبل از پوش، فهرست کامیت‌های خروجی را تازه‌سازی کنید.",
    "ar": "حدّث قائمة الدفع قبل الدفع.",
    "zh": "推送前请刷新待推送列表。"
  },
  "The branch changed after this preview. Refresh the push list before pushing.": {
    "fa": "شاخه بعد از پیش‌نمایش تغییر کرد. قبل از پوش فهرست را تازه‌سازی کنید.",
    "ar": "تغيّر الفرع بعد المعاينة. حدّث قائمة الدفع قبل الدفع.",
    "zh": "预览后分支发生了变化。推送前请刷新待推送列表。"
  },
  "The remote-tracking branch changed after this preview. Fetch and refresh the push list before pushing.": {
    "fa": "شاخهٔ ریموت بعد از پیش‌نمایش تغییر کرد. قبل از پوش، فچ و تازه‌سازی کنید.",
    "ar": "تغيّر الفرع البعيد بعد المعاينة. اجلب التحديثات وحدّث قائمة الدفع قبل الدفع.",
    "zh": "预览后远程跟踪分支发生了变化。推送前请获取远程更新并刷新列表。"
  },
  "Select a branch before pushing.": {
    "fa": "قبل از پوش یک شاخه انتخاب کنید.",
    "ar": "اختر فرعًا قبل الدفع.",
    "zh": "推送前请选择分支。"
  },
  "Configure an upstream before pushing.": {
    "fa": "قبل از پوش، upstream را تنظیم کنید.",
    "ar": "اضبط الفرع المتتبّع قبل الدفع.",
    "zh": "推送前请配置上游。"
  },
  "The remote has commits you do not have. Fetch and pull before pushing.": {
    "fa": "ریموت کامیت‌هایی دارد که در سیستم شما نیست. قبل از پوش، فچ و پول کنید.",
    "ar": "يحتوي المستودع البعيد على التزامات غير موجودة لديك. اجلبها واسحبها قبل الدفع.",
    "zh": "远程有本机尚未包含的提交。推送前请先获取并拉取。"
  },
  "There are no commits to push.": {
    "fa": "کامیتی برای پوش وجود ندارد.",
    "ar": "لا توجد التزامات للدفع.",
    "zh": "没有可推送的提交。"
  },
  "This commit is no longer in the outgoing list. Refresh and try again.": {
    "fa": "این کامیت دیگر در فهرست خروجی نیست. تازه‌سازی کنید و دوباره امتحان کنید.",
    "ar": "هذا الالتزام لم يعد في قائمة الدفع. حدّث وحاول مجددًا.",
    "zh": "此提交已不在待推送列表中。请刷新后重试。"
  },
  "Choose a valid commit from the push list.": {
    "fa": "یک کامیت معتبر از فهرست پوش انتخاب کنید.",
    "ar": "اختر التزامًا صالحًا من قائمة الدفع.",
    "zh": "请从待推送列表中选择有效的提交。"
  },
  "Created commit {hash}.": {
    "fa": "کامیت {hash} ساخته شد.",
    "ar": "أُنشئ الالتزام {hash}.",
    "zh": "已创建提交 {hash}。"
  },
  "Staged {count} file(s).": {
    "fa": "{count} فایل استیج شد.",
    "ar": "جُهّزت الملفات: {count}.",
    "zh": "已暂存 {count} 个文件。"
  },
  "Unstaged {count} file(s).": {
    "fa": "{count} فایل از استیج خارج شد.",
    "ar": "أُلغي تجهيز الملفات: {count}.",
    "zh": "已取消暂存 {count} 个文件。"
  }
};
