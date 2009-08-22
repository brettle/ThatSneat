/**
 * @author brettle
 */

dojo.require("dojo.date");
dojo.require("dijit.layout.ContentPane");
dojo.require("dijit.form.TextBox");
dojo.require("dijit.form.Button");
dojo.require("dojox.data.JsonRestStore");
dojo.require("persevere.persevere");
dojo.require("persevere.Login");

var tn = {
	student: null,
	user: null,
	
	authenticate: function() {
		
        dojo.xhrPost({
            url: "/Class/User",
            postData: dojo.toJson({method: "getCurrentUser", id:"getCurrentUser", params:[]}),
            handleAs: "json",
            load: function(resp, req) { 
				tn.user = resp.result; 
				if (tn.user) 
					initSingletons();
				else 
					login(); 
			},
			error: login
        });
		
		function login(){
			var loginWidget = new persevere.Login({
				userUrl: "/Class/User",
				onLoginSuccess: function(){
					tn.user = loginWidget.currentUser;
					initSingletons();
				}
			});
			dojo.body().appendChild(loginWidget.domNode);
			loginWidget.startup();
		}
		function initSingletons() {
			tn.activities.push(new tn.MemoryActivity());
			var userName = tn.user.name;
			tn.Student.prototype.store.fetch({
				query: {userName: userName}, 
				onItem: function(student) {
					tn.student = student;
				},
				onComplete: function() {
					if (!tn.student)
						tn.student = new tn.Student(userName);
					tn.displayStartPane();
				},
				onError: function(errData) {
					console.error("Error finding student " + userName + ": " + errData);
				}				
			});
		}
	},
	
	displayStartPane: function() {
		tn.pane = new dijit.layout.ContentPane({
			content: ""
		}, "tnPane");
		tn.messagePane = new dijit.layout.ContentPane({
			content: "Welcome " + tn.student.userName + "!"
		}, "tnMessagePane");
		tn.displaySuggestedActivities();
	},
	
	displaySuggestedActivities: function()
	{
		var acts = tn.student.getSuggestedActivities();
		tn.pane.attr("content", "<div id='activityList'>Choose an Activity<br/></div>");
		dojo.forEach(acts, function(a) {
			var button = new dijit.form.Button({
				label: a.name, 
				onClick: function() {tn.startChosenActivity(a);}
			});
			button.placeAt("activityList");			
		});
	},
	
	startChosenActivity: function(act) {
		act.start(tn.student, tn.pane).addCallback(tn.displaySuggestedActivities);
	},
	
	congratulate: function() {
		var deferred = new dojo.Deferred();
		tn.messagePane.attr("content", "Good job!");
		deferred.callback();
		return deferred;
	},
	
	remind: function() {
		var deferred = new dojo.Deferred();
		tn.messagePane.attr("content", "<span id='remind'>Nope.  Here is the correct answer.</span>");
		new dijit.form.Button({
			label: "Try Again",
			onClick: dojo.hitch(deferred, "callback")
		}).placeAt('remind', "after");
		return deferred;
	},
	
	declarePersistent: function(localClassName, superClass, props) {
		// if (superClass && superClass.constructor) superClass = dojo.clone(superClass);
		// if (props && props.constructor)	props = dojo.clone(props);
		if (!props.store)
			props.store = new dojox.data.JsonRestStore({ target: "/" + localClassName });
		props.save = function() {
			props.store.save(this);
		}
		props.changing = function() {
			props.store.changing(this);
		}
		if (superClass == null) {
			superClass = Object;
		}
		if (!(superClass instanceof Array)) {
			superClass = [superClass];
		}
		superClass.push(props.store.getConstructor());
		props.store.schema.prototype = dojo.declare("tn." + localClassName, superClass, props);
		return props.store.schema.prototype;
	},
	
	// Namespace for persevere classes
	persevere: {},
	
	activities: []
};

// A student has a name, a password, a set of skills at performing tasks, and a memory model
// which predicts how much skill they retain over time based on past tests of those skills.
tn.declarePersistent("Student", null, {
	constructor: function (userName) {
		this.userName = userName;
		this.skills = [];
		this.memoryModel = new tn.AdHocMemoryModel(this);
	},
		
	getSuggestedActivities: function() {
		var acts = tn.activities;
		
		var actRates = [];
        dojo.forEach(acts, function(act){
			actRates.push({activity: act, rate: act.predictBenefitRate(this)})
		}, this);
		
		actRates.sort(function(a,b) { return b.rate - a.rate; });
		var sortedActs = [];
		dojo.forEach(actRates, function(actRate) { sortedActs.push(actRate.activity); });
		return sortedActs;
	},
		
	addTasks: function(tasks) {
		this.changing();
		dojo.forEach(tasks, function(t) {
			this.skills.push(new tn.Skill(t));
		}, this);
		this.save();
	}
});

// A specific task that a student should be able to perform.
tn.declarePersistent("Task", null, {
	constructor: function () {
	}
});

// The task of remembering a fact
tn.declarePersistent("MemoryTask", tn.Task, {
	constructor: function (question, answer) {
		this.question = question;
		this.answer = answer;
	}
});

// A student's skill at achieving a particular task
tn.declarePersistent("Skill", null, {
	constructor: function (task) {
		this.task = task;
		this.importance = 1.0;
		this.testResults = [];
	},
	
	getLastTestResultBefore: function(date) {
		var priorTest = null;
		for(var i = testResults.length - 1; i >= 0; i--) {
			if (dojo.date.compare(testResults[i].date, d) < 0) {
				priorTest = testResults[i];
				break;
			}
		}
		if (priorTest == null) {
			throw new Error("No test date prior to " + date)
		}
		return priorTest;
	},
});

// A test result
tn.declarePersistent("TestResult", null, {
	constructor: function (date, numCorrect, numQuestions) {
		this.date = date;
		this.numCorrect = numCorrect;
		this.numQuestions = numQuestions;
	}
});

// A model of how a student's past test results predict their retention
tn.declarePersistent("MemoryModel", null, {
	constructor: function () {
	},
	
	// Predict the probability of recalling a skill at a particular date.
	predictRetention: function(skill, date) {
		throw new Error("Must be overriden in subclass " + this);
	},
	
	// Predict the benefit of testing a skill at a particular date.  The benefit is
	// the increase in the integral of the retention function from the specified date
	// until the end of time.
	predictBenefit: function(skill, date) {
		throw new Error("Must be overriden in subclass " + this);
	}
});


// A model of how a student's past test results predict their retention
tn.declarePersistent("AdHocMemoryModel", [tn.MemoryModel], {
	constructor: function () {
		// The time after a student first learns a task that he can go without practice
		// before he is only able to perform the task 1/e% (~37%) of the time. 
		this.initialStrength = 1000*60*30; // 30min in ms
	},
	
	// Predict the probability of recalling a skill at a particular date.
	predictRetention: function(skill, date) {
		var d = date || new Date();
		if (!skill.testResults.length)
			return 0.0;
		var tras = this._getTestResultAndStrength(skill, date);
		var strength = tras.strength;
		t = dojo.date.difference(d, tras.testResult.date, "millisecond");
		return Math.exp(-t/strength);
	},
	
	// Predict the benefit of testing a skill at a particular date.  The benefit is
	// the increase in the integral of the retention function from the specified date
	// until the end of time.
	predictBenefit: function(skill, date) {
		var d = date || new Date();
		if (!skill.testResults.length)
			return 0.0;
		var tras = this._getTestResultAndStrength(skill, date);
		var strength = tras.strength;
		var p = this.predictRetention(skill, date);
		var oldV = p * strength;
		var t = dojo.date.difference(d, tras.testResult.date, "millisecond");
		var newV = p*(t+strength*Math.exp(-t/strength))+(1-p)*(t*Math.exp(-t/strength)+1);
		return newV - oldV;
	},
	
	// Return the last test result before a particular date, along with the predicted
	// skill strength after the test. 
	_getTestResultAndStrength: function(skill, date)
	{
		var d = date || new Date();
		if (!skill.testResults.length)
			return null;
		var strength = this.initialStrength;
		var tr = skill.testResults[0];
		for (var i = 1; i < skill.testResults.length; i++) {
			if (dojo.date.compare(skill.testResults[i].date, d) > 0)
				break;
			var tr = skill.testResults[i];
			var t = dojo.date.difference(tr.date, skill.testResults[i-1].date, "millisecond");
			var p = (1.0*tr.numCorrect/tr.numQuestions);
			strength = p*(t+strength*Math.exp(-t/strength))+(1-p)*(t*Math.exp(-t/strength)+1);
		}
		return {
			testResult: tr,
			strength: strength
		};
	}
});

// A prerequisite
tn.declarePersistent("PreRequisite", null, {
	constructor: function (skill, requiredRetention) {
		this.skill = skill;
		this.requiredRetention = requiredRetention;
	},
	
	isMet: function() {
		return (this.skill.predictRetention() > this.requiredRetention);
	}
});

// An activity that can be undertaken to improve some of a student's skills
dojo.declare("tn.Activity", null, {
	constructor: function () {
		this.prerequisites = []; // 
	},
	
	// Predicts benefit rate for a student
	predictBenefitRate: function(student) {
		// TODO: Calculate time required to meet all prerequisites

		var skillNetBenefits = this.getSortedSkillNetBenefits(student);
		if (skillNetBenefits.length == 0)
			return 0;
		// Find the skill with the maximum net benefit and calc the benefit rate
		// for doing this activity with just that skill.
		// Note that subclasses might need more than one skill to operate properly (e.g. crosswords)
		var best = skillNetBenefits[skillNetBenefits.length-1];
		return best.netBenefit / this.predictDuration(student, [best.skill]);
	},
	
	getSortedSkillNetBenefits: function(student) {
		var now = new Date();
		var tomorrow = dojo.date.add(now, "day", 1);
				
		var skillNetBenefits = [];
		// For each skill this activity applies to, predict the net benefit
		// of practicing it now over practicing it tomorrow
		dojo.forEach(student.skills, function(skill) {
		 	if (this.canImproveSkill(skill)) {
				skillNetBenefits.push({
					skill: skill, 
					netBenefit: skill.importance*(student.memoryModel.predictBenefit(skill, now) - student.memoryModel.predictBenefit(skill, tomorrow))
					});
			}
		}, this);
		// Sort by net benefit.
		skillNetBenefits.sort(function(a,b) { return b.netBenefit - a.netBenefit; });
		return skillNetBenefits;
	},
	
	predictDuration: function(student, skills) {
		var msPerAttempt = 10*1000;
		var duration = 0;
		dojo.forEach(skills, function(skill) {
			// We need to present each skill at least once, and the retention rate tells us
			// the probably we will need to present it a second time.
			duration += msPerAttempt * (1 + (1-student.memoryModel.predictRetention(skill)))
		});
		return duration;
	},
	
	canImproveSkill: function(skill) {
		// Override in subclasses to see if activity is applicable to skill's task
		return false;
	}
});

// An activity to test and improve the student's memory
dojo.declare("tn.MemoryActivity", tn.Activity, {
	constructor: function () {
		this.name = "Question and Answer";
		this.prerequisites = []; // 
	},
	
	canImproveSkill: function(skill) {
		return (skill.task instanceof tn.MemoryTask);
	},
	
	start: function(student, pane) {
		var deferred = new dojo.Deferred();
		var act = this;
		var skillNetBenefits = this.getSortedSkillNetBenefits(student);
		if (skillNetBenefits.length == 0) {
			tn.messagePane.attr("content", "You need to add some tasks");
			deferred.callback();
			return deferred;
		}
		var bestSkill = skillNetBenefits[0].skill;
		askQuestion();
		return deferred;
		function askQuestion() {
			pane.attr("content", "<span id='question'>" + bestSkill.task.question + "</span>");
			var answerBox = new dijit.form.TextBox({trim: true});
			answerBox.attr("value", "");
			answerBox.placeAt("question", "after");
			dojo.connect(answerBox, "onKeyPress", function(e) {
				if (e.charOrCode != dojo.keys.ENTER)
					return;
				var isCorrect = (answerBox.attr("value") == bestSkill.task.answer);
				bestSkill.changing();
				bestSkill.testResults.push(new tn.TestResult(new Date(), (isCorrect ? 1 : 0), 1));
				bestSkill.save();
				if (isCorrect)
				{
					tn.congratulate().addCallback(dojo.hitch(deferred, "callback"));
				}
				else
				{
					answerBox.attr("value", bestSkill.task.answer);
					answerBox.attr("readOnly", true);
					tn.remind().addCallback(askQuestion);
				}
			});
		}
	}
});

dojo.addOnLoad(function() {
	// This just forces calls to the server so that pjs.getUserName() will work.
	//	pjs.loadClasses("/", tn.authenticate, tn.persevere);
	tn.authenticate();
});



// calculate, apply
// pronounce, read, recall, comprehend,
// print, write, type
// spell, compose, define
// recognize, name, locate
// order, group, organize
// create, analyze, critique
   

