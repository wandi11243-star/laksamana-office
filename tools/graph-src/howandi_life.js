// DIHASILKAN OTOMATIS oleh tools/graph-src.ps1 - JANGAN DISUNTING.
// Kerangka panggilan antar fungsi deploy/howandi_life/index.html, untuk dibaca graphify.
// Nomor baris di sini SAMA dengan nomor baris di deploy/howandi_life/index.html - sunting DI SANA.






























































































































































































































































































































































































































































function svg() {  }

















function apiConfigured() {  }
function _fetchTO() {  }
function apiGetState() { _fetchTO(); }





function apiSaveState() { _fetchTO(); }









function hashPw() {  }
function tryUnlock() { hashPw(); bootApp(); }




function uid() {  }
function todayISO() {  }
function daysAgoISO() {  }
function inDaysISO() {  }
function monthKey() {  }
function fmtMonth() { emptyState(); migrate(); }







function emptyState() {  }









function migrate() { emptyState(); uid(); weekKey(); }














function load() { apiConfigured(); apiGetState(); migrate(); emptyState(); }





function save() {  }
function flushSave() { apiConfigured(); apiSaveState(); toast(); }











function quadrant() {  }
function isOverdue() { todayISO(); }
function fmtDue() { todayISO(); inDaysISO(); daysAgoISO(); }
function fmtRp() {  }
function goalPct() {  }
function toast() {  }
function esc() {  }
function netWorth() {  }
function totalAssets() {  }
function totalLiab() {  }
function bizRevTotal() {  }
function projTasks() {  }
function projProgress() { projTasks(); }
function applyTaskFilter() {  }


function pad() {  }
function gcalDates() { pad(); }
function gcalLink() { gcalDates(); }
function openGcal() { gcalLink(); toast(); }
function icsBlock() { uid(); }
function exportICS() { icsBlock(); toast(); }


function setView() { render(); closeModal(); }
function render() { renderMobnav(); hydrateIcons(); }








function hydrateIcons() { svg(); }

function taskRow() { quadrant(); isOverdue(); toggleTask(); svg(); fmtDue(); openGcal(); esc(); openTaskModal(); delTask(); }

function goalRow() { goalPct(); }


function viewHome() { todayISO(); isOverdue(); ledgerMonths(); monthAgg(); openTaskModal(); svg(); setDial(); setView(); fmtRp(); netWorth(); totalAssets(); bizRevTotal(); fmtMonth(); taskRow(); toggleTask(); fmtDue(); goalRow(); addDump(); rmDump(); toggleHabit(); save(); }




























function viewTasks() { applyTaskFilter(); render(); openTaskModal(); svg(); matrixHtml(); listHtml(); todayISO(); isOverdue(); inDaysISO(); bizHtml(); }









function matrixHtml() { taskRow(); }
function listHtml() { taskRow(); }
function bizHtml() { taskRow(); }



function viewProjects() { openProjModal(); svg(); dropProj(); projCard(); }



function projCard() { projProgress(); projTasks(); dragProj(); openProjectDetail(); todayISO(); fmtDue(); }

function dragProj() {  }
function dropProj() { save(); render(); }
function openProjectDetail() { render(); }
function viewProjectDetail() { setView(); projTasks(); projProgress(); svg(); fmtDue(); openProjModal(); openTaskModal(); esc(); openGcal(); taskRow(); }














function viewContent() { openChannelsModal(); svg(); openContentModal(); render(); esc(); dropContent(); contentCard(); }





function contentCard() { dragContent(); openContentModal(); fmtDue(); }

function dragContent() {  }
function dropContent() { save(); render(); }




function viewGoals() { openGoalModal(); svg(); goalPct(); setView(); milestoneLabel(); delGoal(); }






function viewRoadmap() { render(); openMileModal(); openDreamModal(); svg(); timelineHtml(); dreamsHtml(); }




function timelineHtml() { milestoneGoals(); milestoneDreams(); milestoneProgress(); toggleMile(); svg(); setView(); goalPct(); openMileModal(); delMile(); }
function dreamsHtml() { svg(); setView(); milestoneLabel(); toggleDream(); openDreamModal(); }


function viewLearning() { openLearnModal(); svg(); delLearn(); }






function scoreBar() {  }
function viewReviews() { render(); openReviewModal(); svg(); weeklyReviewsHtml(); recapHtml(); }




function weeklyReviewsHtml() { fmtWeek(); openReviewModal(); svg(); scoreBar(); delReview(); }
function recapHtml() { monthOfWeek(); fmtMonth(); scoreBar(); }



function weekStart() {  }
function weekKey() { weekStart(); }
function monthOfWeek() {  }
function fmtWeek() {  }
function milestoneLabel() {  }
function milestoneGoals() {  }
function milestoneDreams() {  }
function milestoneProgress() { milestoneGoals(); goalPct(); }
function roadmapOptions() {  }
function rangeLabel() {  }
function calItems() {  }
function calColumns() { todayISO(); calItems(); openEventModal(); }
function viewCalendar() { monthCells(); weekStart(); rangeLabel(); calColumns(); openEventModal(); svg(); exportICS(); calNav(); render(); setCalMode(); }











function setCalMode() { render(); }
function calNav() { render(); }
function monthCells() { todayISO(); calItems(); openEventModal(); }



function viewFinance() { render(); finSummary(); finMonthly(); finAssets(); }




function ledgerMonths() {  }
function scopeLabel() {  }
function monthAgg() {  }
function _v() {  }
function finSummary() { totalAssets(); totalLiab(); ledgerMonths(); monthAgg(); fmtRp(); netWorth(); fmtMonth(); render(); }










function ledEntry() {  }
function finMonthly() { monthKey(); ledEntry(); ledgerMonths(); fmtMonth(); render(); esc(); saveLedgerMonth(); svg(); fmtRp(); scopeLabel(); delLed(); }

















function upsertLed() { ledEntry(); uid(); }
function saveLedgerMonth() { upsertLed(); _v(); save(); render(); toast(); fmtMonth(); }
function delLed() { save(); render(); }
function finAssets() { openAssetModal(); svg(); fmtRp(); delAsset(); netWorth(); }



function viewBusiness() { openBizModal(); svg(); openBizDetail(); fmtRp(); }



function openBizDetail() { render(); }
function viewBizDetail() { setView(); svg(); openBizModal(); fmtRp(); openProjectDetail(); projProgress(); taskRow(); }













function viewSettings() { openPwModal(); svg(); disableAuth(); exportJSON(); exportICS(); resetAll(); }















function exportJSON() { toast(); }
function resetAll() { modalConfirm(); emptyState(); save(); closeModal(); setView(); toast(); }


function renderMobnav() { setView(); svg(); }
function openMoreMenu() { openModal(); closeModal(); svg(); setView(); }




function openModal() { hydrateIcons(); }
function closeModal() {  }
function modalConfirm() { openModal(); closeModal(); svg(); }



function openTaskModal() { openModal(); closeModal(); svg(); esc(); quadrant(); tgl(); delTask(); saveTask(); updateQPrev(); }








function tgl() { updateQPrev(); }
function updateQPrev() { quadrant(); }
function saveTask() { toast(); uid(); save(); closeModal(); render(); }
function toggleTask() { save(); render(); }
function delTask() { save(); render(); }


function openProjModal() { openModal(); closeModal(); svg(); esc(); delProj(); setView(); saveProj(); }








function saveProj() { toast(); uid(); save(); closeModal(); render(); }
function delProj() { save(); render(); }


function openContentModal() { openModal(); closeModal(); svg(); esc(); delContent(); openGcal(); saveContent(); }






function saveContent() { toast(); uid(); save(); closeModal(); render(); }
function delContent() { save(); render(); }
function openChannelsModal() { openModal(); closeModal(); svg(); saveChannels(); }
function saveChannels() { save(); closeModal(); render(); toast(); }


function openGoalModal() { openModal(); closeModal(); svg(); esc(); roadmapOptions(); delGoal(); saveGoal(); }

function saveGoal() { toast(); uid(); save(); closeModal(); render(); }
function delGoal() { save(); render(); }


function openMileModal() { openModal(); closeModal(); svg(); esc(); delMile(); saveMile(); }

function saveMile() { toast(); uid(); save(); closeModal(); render(); }
function toggleMile() { save(); render(); }
function delMile() { save(); render(); }
function openDreamModal() { openModal(); closeModal(); svg(); esc(); roadmapOptions(); delDream(); saveDream(); }

function saveDream() { toast(); uid(); save(); closeModal(); render(); }
function toggleDream() { save(); render(); }
function delDream() { save(); render(); }


function openLearnModal() { openModal(); closeModal(); svg(); esc(); delLearn(); saveLearn(); }

function saveLearn() { toast(); todayISO(); uid(); save(); closeModal(); render(); }
function delLearn() { save(); render(); }


function openReviewModal() { weekKey(); openModal(); closeModal(); svg(); esc(); delReview(); saveReview(); }


function clamp5() {  }
function saveReview() { toast(); weekKey(); clamp5(); uid(); save(); closeModal(); render(); }
function delReview() { save(); render(); }


function openAssetModal() { openModal(); closeModal(); svg(); esc(); setLiab(); delAsset(); saveAsset(); }

function setLiab() {  }
function saveAsset() { toast(); uid(); save(); closeModal(); render(); }
function delAsset() { save(); render(); }


function openEventModal() { openModal(); closeModal(); svg(); esc(); todayISO(); delEvent(); openGcal(); saveEvent(); }

function saveEvent() { toast(); uid(); save(); closeModal(); render(); openGcal(); }
function delEvent() { save(); render(); }


function openBizModal() { openModal(); closeModal(); svg(); esc(); delBiz(); saveBiz(); }

function saveBiz() { toast(); uid(); save(); closeModal(); render(); }
function delBiz() { modalConfirm(); save(); closeModal(); setView(); render(); }


function openPwModal() { openModal(); closeModal(); svg(); savePw(); }
function savePw() { toast(); hashPw(); save(); closeModal(); render(); }
function disableAuth() { modalConfirm(); save(); closeModal(); render(); toast(); }


function setDial() { save(); }
function addDump() { save(); render(); }
function rmDump() { save(); render(); }
function toggleHabit() { todayISO(); save(); render(); }





function logoutOffice() {  }

function toggleNav() {  }






function isiKartuUser() {  }







function bootApp() { svg(); isiKartuUser(); render(); setView(); closeModal(); load(); }