// Skill names mirror the current character-sheet UI definitions.
// Keep in sync until the campaign schema is extracted into a shared package.
export const GROUPS = [
 ["Combat","Form|Celerity|Precision|Axe/Mace|Spear/Polearm|Sword|Bow|Crossbow|Shield|Unarmed"],
 ["Battle","Steadfastness|Tactics|Formation|Skirmish|Hazard: darkness|Hazard: slippery|Hazard: confined|Ambush|Rally|Awareness"],
 ["Athletics","Throw|Wrestle|Ride|Jump|Swim|Climb|Stalk|Tumble|Boat|Trek"],
 ["Body","Brawn|Clout|Speed|Dexterity|Agility|Balance|Durability|Health|Tenacity|Senses"],
 ["Social","Smalltalk|Read Faces|Oration|Nonverbal|Emotional|Logical|Forceful|Personal|Subtle|Humorous"],
 ["Artistic","Sing|Instrument|Compose|Act|Storytell|Author|Dance|Illustrate|Sculpt|Sleight"],
 ["Crafting","Woodwork|Leatherwork|Masonry|Smith|Weave|Tailor|Cook|Brew|Pottery|Artifice"],
 ["Mind","Memory|Reasoning|Wits|Focus|Mental Endurance|Sense of self|Composure|Imagination|Introspection|Intuition"],
 ["Nature","Orienteering|Plants|Birds|Beasts|Fish|Bugs|Traps|Medicines|Surgery|Animal handling"],
 ["Magic","Magic Shield|Gather Mana|Purify Mana|Manawell|Movement|Light|Temperature|Echo|Call|Bond"],
 ["Culture","High Emeri|Low Emeri|Herisian|Vaelthar|Seafolk|Kardsworn|Razyg|Emeri nobles|Revangelism|Merchants"],
 ["Language","Emerspeak|Vealan Elvish|Kardish Dwarf|Squall (seafolk)|Vulgar Herisian|Arcane Herisian|Raggyr|Merchant seals bookkeeping|Sacred speech|Old Ennis"]
].map(([name,list])=>({name,skills:list.split("|")}));
export const MAGIC_ALTERNATIVES = {
 Arcane: GROUPS.find(g=>g.name==="Magic").skills,
 Divine: "Attunement|Healing|Restoration|Benediction|Divine Protection|Purification|Exorcism|Anchoring|Cursing|Domination".split("|"),
 Druidic: "Borrow Form|Borrow Aspect|Borrow Movement|Borrow Senses|Borrow Vitality|Borrow Instinct|Natural Remedies|Hidden Self|Natural Guard|Swift Change".split("|"),
 "Physical Adept": "Battle Aura|Mental Block|Magic Resistance|Ignore Pain|Restore Aura|Sixth Sense|Multi-Focus|Adrenaline Surge|Cleave Magic|Hard to Kill".split("|")
};
