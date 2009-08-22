/**
 * @author brettle
 */
Class({
	id: "Student"
});

Class({
	id: "Task"
});

Class({
	id: "MemoryTask", 
	"extends": Task
});

Class({
	id: "Skill"
});

Class({
	id: "TestResult"
});

Class({
	id: "MemoryModel"
});

Class({
	id: "AdHocMemoryModel",
	"extends": MemoryModel
});

Class({
	id: "PreRequisite"
});
