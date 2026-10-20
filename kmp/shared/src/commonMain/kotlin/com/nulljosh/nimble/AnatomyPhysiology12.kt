package com.nulljosh.nimble

import com.nulljosh.nimble.Precalc.pcNum
import kotlin.math.abs

/**
 * BC Anatomy and Physiology 12 with no network: cell structures, membrane transport, biological molecules, enzymes,
 * DNA replication, protein synthesis, homeostasis and the body systems, plus DNA and RNA sequence work and cardiac
 * output. A port of `ap12()` in docs/engine.js; the tables are copied from there by script. Precalc.answer asks it
 * right after LifeSciences11.
 */
internal object AnatomyPhysiology12 {
    /** Phrase questions, matched anywhere. */
    private val facts = listOf(
        """\b(?:four|4|main) (?:types|classes|groups|kinds) of (?:biological )?(?:macromolecules|biomolecules|organic molecules|molecules)\b|\b(?:biological )?macromolecules\b.*\b(?:types|four)\b""" to "Carbohydrates, lipids, proteins and nucleic acids.",
        """\b(?:monomers?|building blocks?|subunits?) (?:of|for) (?:an? )?proteins?\b|\bproteins? (?:are )?made (?:up )?of\b""" to "Amino acids, joined by peptide bonds. There are 20 kinds.",
        """\b(?:monomers?|building blocks?|subunits?) (?:of|for) (?:an? )?(?:carbohydrates?|polysaccharides?|starch|glycogen|cellulose)\b|\bcarbohydrates? (?:are )?made (?:up )?of\b""" to "Monosaccharides (simple sugars) such as glucose.",
        """\b(?:monomers?|building blocks?|subunits?) (?:of|for) (?:an? )?(?:nucleic acids?|dna|rna)\b|\bnucleic acids? (?:are )?made (?:up )?of\b""" to "Nucleotides, each a sugar, a phosphate group and a nitrogen base.",
        """\b(?:monomers?|building blocks?|subunits?) (?:of|for) (?:an? )?(?:lipids?|fats?|triglycerides?)\b|\b(?:lipids?|fats?|triglycerides?) (?:are )?made (?:up )?of\b""" to "A triglyceride (fat) is one glycerol joined to three fatty acids. Lipids have no true repeating monomer.",
        """\b(?:hypotonic)\b.*\b(?:solution|cell)\b|\bcell\b.*\bhypotonic\b""" to "Water moves into the cell by osmosis, so it swells. An animal cell such as a red blood cell can burst (lyse); a plant cell turns firm (turgid) against its wall.",
        """\b(?:hypertonic)\b.*\b(?:solution|cell)\b|\bcell\b.*\bhypertonic\b""" to "Water moves out of the cell by osmosis, so it shrinks. A red blood cell shrivels (crenates); a plant cell's membrane pulls away from its wall (plasmolysis).",
        """\b(?:isotonic)\b.*\b(?:solution|cell)\b|\bcell\b.*\bisotonic\b|^isotonic$|^an isotonic solution$""" to "A solution with the same solute concentration as the cell, so water moves in and out equally: no net change in size.",
        """\b(?:how does|effect of) temperature\b.*\benzym|\benzym.*\btemperature\b""" to "Activity rises with temperature up to an optimum (about 37 °C for human enzymes), because molecules collide more often. Past it the enzyme denatures, its active site loses its shape, and activity drops fast.",
        """\b(?:how does|effect of) ph\b.*\benzym|\benzym.*\bph\b""" to "Each enzyme works best at an optimum pH (about 2 for pepsin in the stomach, about 8 for trypsin in the small intestine). Far from it the active site changes shape and the enzyme denatures.",
        """\b(?:how does|effect of) (?:substrate )?concentration\b.*\benzym|\benzym.*\bsubstrate concentration\b""" to "More substrate speeds the reaction until every active site is busy (saturation); then the rate levels off. More enzyme raises the top rate.",
        """\bwhere (?:does|is) transcription\b""" to "In the nucleus, where RNA polymerase copies a gene into mRNA.",
        """\bwhere (?:does|is) translation\b""" to "On ribosomes in the cytoplasm (free or on the rough ER).",
        """\bwhere (?:does|is) (?:dna )?replication\b""" to "In the nucleus, during the S phase before a cell divides.",
        """\bwhat enzyme (?:unzips|unwinds|separates|opens)\b|\benzyme that (?:unzips|unwinds|separates)\b""" to "Helicase, which breaks the hydrogen bonds between the base pairs.",
        """\b(?:three |3 )?stop codons\b""" to "UAA, UAG and UGA.",
        """\bstart codon\b""" to "AUG, which also codes for methionine.",
        """\bdna\b.*\brna\b.*\bdifferen|\bdifferen.*\bdna\b.*\brna\b|\bdna vs\.? rna\b""" to "DNA is double-stranded with the sugar deoxyribose and the base thymine, and stays in the nucleus. RNA is single-stranded with the sugar ribose and uracil in place of thymine, and works in the cytoplasm too.",
        """\barter(?:y|ies)\b.*\bveins?\b|\bveins?\b.*\barter(?:y|ies)\b""" to "Arteries carry blood away from the heart under high pressure, with thick muscular walls. Veins carry blood back toward the heart under low pressure, with thinner walls and valves to stop backflow.",
        """\bpacemaker of the heart\b|\bheart'?s (?:natural )?pacemaker\b""" to "The SA (sinoatrial) node in the wall of the right atrium.",
        """\bwhere (?:does|is) gas exchange\b|\bgas exchange (?:occur|happen|take place)""" to "In the alveoli of the lungs, across their thin walls into the surrounding capillaries. In the tissues it happens across capillary walls.",
        """\bfunctional unit of (?:the )?kidneys?\b""" to "The nephron. Each kidney has about a million.",
        """\bfunctional unit of (?:the )?nervous system\b""" to "The neuron.",
        """\bfunctional unit of (?:the )?lungs?\b""" to "The alveolus, a tiny air sac where gases are exchanged.",
        """\b(?:what )?enzyme (?:that )?(?:breaks? down|digests?) (?:starch|carbohydrates?)\b""" to "Amylase, from the salivary glands and the pancreas, which breaks starch into maltose.",
        """\b(?:what )?enzyme (?:that )?(?:breaks? down|digests?) proteins? in the stomach\b""" to "Pepsin.",
        """\b(?:what )?enzyme (?:that )?(?:breaks? down|digests?) proteins?\b""" to "Pepsin in the stomach, then trypsin from the pancreas in the small intestine, and peptidases in the intestinal lining.",
        """\b(?:what )?enzyme (?:that )?(?:breaks? down|digests?) (?:fats?|lipids?)\b""" to "Lipase, mostly from the pancreas, after bile has emulsified the fat.",
        """\b(?:what )?enzyme (?:that )?(?:breaks? down|digests?) (?:dna|rna|nucleic acids?)\b""" to "Nucleases from the pancreas.",
        """\bwhere (?:does|do) (?:the )?(?:chemical )?digestion of (?:starch|carbohydrates?) (?:begin|start)\b""" to "In the mouth, with salivary amylase.",
        """\bwhere (?:does|do) (?:the )?(?:chemical )?digestion of proteins? (?:begin|start)\b""" to "In the stomach, with pepsin.",
        """\bwhere (?:does|do) (?:the )?(?:chemical )?digestion of (?:fats?|lipids?) (?:begin|start)\b""" to "Mostly in the small intestine, with bile and pancreatic lipase.",
        """\bwhere (?:are|is) (?:most )?nutrients? absorbed\b""" to "In the small intestine, through its villi and microvilli.",
        """\b(?:example|examples) of negative feedback\b""" to "Body temperature control (sweating when hot, shivering when cold), blood sugar control by insulin and glucagon, and water balance by ADH.",
        """\b(?:example|examples) of positive feedback\b""" to "Contractions during childbirth (oxytocin), blood clotting, and the surge before ovulation.",
        """\b(?:which way|what direction|direction)\b.*\bwater\b.*\bosmosis\b|\bosmosis\b.*\b(?:which way|direction)\b""" to "From the side with less solute (more water, hypotonic) to the side with more solute (less water, hypertonic).",
        """\bexamples? of (?:an? )?polysaccharides?\b""" to "Starch and cellulose in plants, glycogen in animals.",
        """\bexamples? of (?:an? )?monosaccharides?\b""" to "Glucose, fructose and galactose.",
        """\bexamples? of (?:an? )?disaccharides?\b""" to "Sucrose (table sugar), lactose (milk sugar) and maltose.",
        """\bexamples? of (?:an? )?lipids?\b""" to "Fats and oils (triglycerides), phospholipids, steroids such as cholesterol and testosterone, and waxes.",
        """\bexamples? of (?:an? )?enzymes?\b""" to "Amylase (starch), pepsin and trypsin (protein), lipase (fat), catalase (hydrogen peroxide), and DNA polymerase.",
        """\bsubstrate (?:of|for) amylase\b""" to "Starch, which amylase breaks into maltose.",
        """\bsubstrate (?:of|for) (?:pepsin|trypsin)\b""" to "Proteins, broken into shorter peptides.",
        """\bsubstrate (?:of|for) lipase\b""" to "Fats (triglycerides), broken into fatty acids and glycerol.",
        """\bsubstrate (?:of|for) catalase\b""" to "Hydrogen peroxide, broken into water and oxygen.",
        """\bsubstrate (?:of|for) (?:lactase|maltase|sucrase)\b""" to "Its sugar: lactase splits lactose, maltase splits maltose, sucrase splits sucrose.",
        """\b(?:what happens to|is) (?:an |the )?enzyme\b.*\b(?:after|used up|end of)\b""" to "Nothing: it comes out of the reaction unchanged and is reused again and again.",
        """\boptimum temperature\b.*\b(?:human|body)\b|\b(?:human|body) enzymes?\b.*\boptimum\b""" to "About 37 °C, body temperature.",
        """\bbase[- ]pair(?:ing)? rules?\b|\bcomplementary base pair(?:ing|s)?\b|\bwhich bases pair\b""" to "In DNA, adenine (A) pairs with thymine (T) and cytosine (C) pairs with guanine (G). In RNA, A pairs with uracil (U).",
        """\bholds?\b.*\bstrands?\b.*\bdna\b.*\btogether\b|\bholds?\b.*\bdna strands?\b|\bbonds?\b.*\bbetween (?:the )?(?:dna )?bases\b""" to "Hydrogen bonds between the paired bases: two between A and T, three between C and G.",
        """\b(?:how does the body|body'?s?)\b.*\b(?:respond|react|response|cool)\b.*\b(?:too hot|hot|overheat)|\bwhen (?:it is |you are |the body is )?too hot\b""" to "Sweat glands release sweat that cools the skin as it evaporates, and blood vessels near the skin widen (vasodilation) to lose heat. The hypothalamus runs it as a negative feedback loop.",
        """\b(?:how does the body|body'?s?)\b.*\b(?:respond|react|response|warm)\b.*\b(?:too cold|cold)|\bwhen (?:it is |you are |the body is )?too cold\b""" to "Muscles shiver to make heat, blood vessels near the skin narrow (vasoconstriction) to keep it in, and body hair stands up. The hypothalamus runs it as a negative feedback loop.",
        """\bwhere (?:is|does) bile (?:made|produced|come from)\b""" to "In the liver.",
        """\bwhere (?:is|does) bile (?:stored|kept)\b""" to "In the gallbladder, which releases it into the small intestine.",
        """\bwhere (?:is|are) (?:insulin|glucagon) (?:made|produced|released)\b""" to "In the pancreas, by the islets of Langerhans.",
        """\bwhere (?:is|are) (?:adh|antidiuretic hormone) (?:made|produced|released)\b""" to "Made in the hypothalamus and released by the posterior pituitary gland.",
        """\bwhere (?:is|are) urine (?:made|produced|formed)\b""" to "In the nephrons of the kidneys.",
        """\bwhere (?:is|are) red blood cells (?:made|produced|formed)\b""" to "In the red bone marrow.",
    ).map { Regex(it.first) to it.second }

    /** Structures and ideas, matched as the whole term: (pattern, description). */
    private val terms = listOf(
        """nucle(?:us|i)""" to "Holds the cell's DNA and controls its activities, including which proteins are made.",
        """nucleol(?:us|i)""" to "A dense region in the nucleus that makes ribosomes.",
        """mitochondri(?:a|on)""" to "Makes ATP, the cell's usable energy, by cellular respiration. It has its own DNA.",
        """ribosomes?""" to "Builds proteins by joining amino acids in the order the mRNA spells out (translation).",
        """rough (?:endoplasmic reticulum|er)""" to "Membranes studded with ribosomes that make and fold proteins for export or for membranes, then send them to the Golgi in vesicles.",
        """smooth (?:endoplasmic reticulum|er)""" to "Makes lipids such as phospholipids and steroid hormones, and detoxifies drugs and poisons, mostly in liver cells.",
        """endoplasmic reticulum""" to "A network of membranes. Rough ER, covered in ribosomes, makes proteins; smooth ER makes lipids and detoxifies.",
        """golgi(?: apparatus| body| complex)?""" to "Modifies, sorts and packages proteins and lipids from the ER into vesicles and ships them where they go, including out of the cell.",
        """lysosomes?""" to "Sacs of digestive enzymes that break down worn-out organelles, food particles and invading bacteria.",
        """vesicles?""" to "Small membrane sacs that transport and store materials inside the cell, and carry them to the membrane to leave.",
        """vacuoles?""" to "Stores water, food and wastes. Plant cells have one large central vacuole that also keeps the cell firm.",
        """(?:cell|plasma) membrane""" to "Controls what enters and leaves the cell (it is selectively permeable) and holds receptors for signals.",
        """cytoskeleton""" to "A network of protein fibres (microtubules and microfilaments) that gives the cell its shape and support, and moves organelles and the cell.",
        """centrioles?""" to "Organize the spindle fibres that pull chromosomes apart during cell division.",
        """cytoplasm""" to "The fluid and everything in it between the membrane and the nucleus, where many reactions happen.",
        """chloroplasts?""" to "Carries out photosynthesis in plant cells, turning light energy into sugar.",
        """peroxisomes?""" to "Breaks down fatty acids and toxic hydrogen peroxide.",
        """(?:the )?fluid mosaic model""" to "The cell membrane is a fluid double layer of phospholipids with proteins, cholesterol and carbohydrate chains floating in it like tiles in a mosaic.",
        """phospholipids?""" to "A lipid with a water-loving phosphate head and two water-fearing fatty acid tails. They form the double layer (bilayer) of cell membranes.",
        """diffusion""" to "Particles spreading from an area of high concentration to low concentration, with no energy used.",
        """osmosis""" to "The diffusion of water across a selectively permeable membrane, from where there is more water (less solute) to where there is less water (more solute).",
        """facilitated diffusion""" to "Passive transport through a membrane protein, a channel or a carrier, down the concentration gradient, with no energy used. Glucose enters cells this way.",
        """active transport""" to "Moving substances across a membrane against their concentration gradient (low to high) using energy from ATP and carrier proteins, like the sodium-potassium pump.",
        """passive transport""" to "Movement across a membrane down a concentration gradient with no energy used: diffusion, osmosis and facilitated diffusion.",
        """endocytosis""" to "The cell takes in large particles or fluid by folding its membrane around them into a vesicle. Phagocytosis takes in solids, pinocytosis liquids.",
        """exocytosis""" to "A vesicle fuses with the cell membrane and releases its contents out of the cell, as when hormones or enzymes are secreted.",
        """phagocytosis""" to "Cell eating: the cell engulfs a large particle such as a bacterium into a vesicle.",
        """pinocytosis""" to "Cell drinking: the cell takes in droplets of fluid in small vesicles.",
        """(?:a |an )?hypotonic solution|hypotonic""" to "A solution with less solute than the cell, so water moves into the cell and it swells.",
        """(?:a |an )?hypertonic solution|hypertonic""" to "A solution with more solute than the cell, so water moves out of the cell and it shrinks.",
        """carbohydrates?""" to "Sugars and starches made of carbon, hydrogen and oxygen, used for quick energy and structure. Monomer: monosaccharides such as glucose.",
        """lipids?""" to "Fats, oils, phospholipids and steroids: they store energy, form membranes and act as hormones. They do not dissolve in water.",
        """proteins?""" to "Chains of amino acids folded into shapes that do most of the cell's work: enzymes, structure, transport, signals and defence.",
        """nucleic acids?""" to "DNA and RNA, chains of nucleotides that store and carry genetic information.",
        """nucleotides?""" to "The monomer of nucleic acids: a five-carbon sugar, a phosphate group and a nitrogen base.",
        """amino acids?""" to "The monomer of proteins. Each has an amino group, a carboxyl group and a side chain (R group); there are 20.",
        """monosaccharides?""" to "A simple sugar, the monomer of carbohydrates, such as glucose, fructose and galactose.",
        """disaccharides?""" to "Two monosaccharides joined by dehydration synthesis, such as sucrose, lactose and maltose.",
        """polysaccharides?""" to "A long chain of monosaccharides: starch and cellulose in plants, glycogen in animals.",
        """glycogen""" to "The polysaccharide animals use to store glucose, mostly in the liver and muscles.",
        """starch""" to "The polysaccharide plants use to store glucose.",
        """cellulose""" to "The polysaccharide that makes plant cell walls. Humans cannot digest it; it is fibre.",
        """triglycerides?""" to "A fat or oil: one glycerol joined to three fatty acids.",
        """saturated fats?""" to "A fat whose fatty acids have only single bonds, so they pack tightly and are solid at room temperature, like butter.",
        """unsaturated fats?""" to "A fat with one or more double bonds in its fatty acids, which bend them, so it is liquid at room temperature, like olive oil.",
        """(?:a )?dehydration synthesis(?: reaction)?|condensation reaction""" to "Two monomers join into a larger molecule and a water molecule is removed (given off). It builds polymers.",
        """hydrolysis(?: reaction)?""" to "Adding water to break a bond between monomers, splitting a polymer apart. Digestion is hydrolysis.",
        """(?:a )?peptide bonds?""" to "The bond between two amino acids, formed by dehydration synthesis.",
        """glycosidic bonds?""" to "The bond between two monosaccharides.",
        """denaturation|denatured|denature""" to "A protein losing its three-dimensional shape (it unfolds) from heat, pH or chemicals, so it stops working.",
        """atp|adenosine triphosphate""" to "Adenosine triphosphate, the molecule cells use for energy. Breaking off a phosphate (ATP to ADP) releases it.",
        """enzymes?""" to "A protein that speeds up (catalyzes) a reaction by lowering its activation energy, without being used up.",
        """(?:the )?active site(?: of an enzyme)?""" to "The pocket on an enzyme where the substrate binds and the reaction happens. Its shape fits the substrate.",
        """substrates?""" to "The molecule an enzyme acts on, which binds at its active site.",
        """activation energy""" to "The energy needed to start a reaction. Enzymes lower it, so reactions happen faster at body temperature.",
        """(?:a )?competitive inhibitors?|competitive inhibition""" to "A molecule shaped like the substrate that binds the active site and blocks it. More substrate can outcompete it.",
        """(?:a )?non-?competitive inhibitors?|non-?competitive inhibition""" to "A molecule that binds an enzyme away from the active site and changes its shape, so the substrate no longer fits. More substrate does not help.",
        """(?:a )?coenzymes?""" to "An organic helper molecule, often made from a vitamin, that an enzyme needs to work.",
        """(?:a )?cofactors?""" to "A non-protein helper an enzyme needs, such as a metal ion like zinc or iron, or a coenzyme.",
        """(?:the )?induced fit(?: model)?""" to "The active site changes shape slightly to grip the substrate as it binds.",
        """(?:the )?lock and key(?: model)?""" to "The substrate fits the enzyme's active site exactly, like a key in a lock.",
        """semi-?conservative replication""" to "Each new DNA molecule keeps one original (parent) strand and one newly built strand.",
        """dna replication|replication""" to "Copying DNA before cell division: helicase unzips the helix, DNA polymerase builds a new strand on each old one, and ligase joins the pieces.",
        """helicase""" to "The enzyme that unzips DNA by breaking the hydrogen bonds between base pairs.",
        """dna polymerase""" to "The enzyme that builds a new DNA strand by adding complementary nucleotides to the template, in the 5' to 3' direction, and proofreads it.",
        """(?:dna )?ligase""" to "The enzyme that seals gaps in the sugar-phosphate backbone, joining Okazaki fragments on the lagging strand.",
        """primase""" to "The enzyme that lays down a short RNA primer so DNA polymerase can start.",
        """okazaki fragments?""" to "Short pieces of DNA built on the lagging strand during replication, later joined by ligase.",
        """(?:the )?leading strand""" to "The new DNA strand built continuously toward the replication fork.",
        """(?:the )?lagging strand""" to "The new DNA strand built in short Okazaki fragments away from the fork, then joined by ligase.",
        """rna polymerase""" to "The enzyme that reads a gene's template strand and builds the matching mRNA (transcription).",
        """transcription""" to "Copying a gene's DNA into messenger RNA (mRNA) in the nucleus, by RNA polymerase.",
        """translation""" to "Reading mRNA on a ribosome to build a protein: tRNA brings the amino acid for each codon.",
        """protein synthesis""" to "Making a protein in two steps: transcription (DNA to mRNA in the nucleus) and translation (mRNA to protein on a ribosome).",
        """mrna|messenger rna""" to "Messenger RNA carries a gene's code from the DNA in the nucleus to a ribosome.",
        """trna|transfer rna""" to "Transfer RNA carries a specific amino acid to the ribosome and matches its anticodon to the mRNA codon.",
        """rrna|ribosomal rna""" to "Ribosomal RNA makes up ribosomes, with proteins, and joins amino acids together.",
        """(?:a )?codons?""" to "A sequence of three (a triplet of) mRNA bases that codes for one amino acid or a stop signal.",
        """(?:an )?anticodons?""" to "The three bases on a tRNA that pair with an mRNA codon.",
        """(?:a )?(?:point|substitution) mutation""" to "One base swapped for another. It may change one amino acid, none, or create a stop codon.",
        """(?:a )?frameshift mutation""" to "A base inserted or deleted, which shifts the reading frame so every codon after it changes.",
        """homeostasis""" to "Keeping the body's internal conditions, such as temperature, blood sugar and water, stable and balanced despite changes outside.",
        """negative feedback(?: loop)?""" to "A change triggers a response that reverses it, returning the body to its set point, as sweating cools you when you are hot.",
        """positive feedback(?: loop)?""" to "A change triggers a response that amplifies it further until an end point, as contractions intensify during childbirth.",
        """mouth""" to "Breaks food up by chewing (mechanical digestion) and starts digesting starch with salivary amylase.",
        """salivary glands?""" to "Make saliva, which moistens food and contains amylase to start digesting starch.",
        """esophagus|oesophagus""" to "Moves food from the throat to the stomach by waves of muscle contraction (peristalsis).",
        """stomach""" to "Stores food and churns it with gastric juice: hydrochloric acid kills microbes and activates pepsin, which starts digesting protein.",
        """small intestine""" to "Finishes digestion with enzymes from the pancreas and its own lining, plus bile from the liver, and absorbs nutrients into the blood through its villi.",
        """large intestine|colon""" to "Absorbs water and salts, holds bacteria that make vitamin K, and forms and stores feces.",
        """liver""" to "Makes bile, stores glycogen, processes nutrients, detoxifies the blood and makes urea.",
        """gall ?bladder""" to "Stores bile from the liver and releases it into the small intestine.",
        """pancreas""" to "Releases digestive enzymes (amylase, trypsin, lipase) and bicarbonate into the small intestine, and the hormones insulin and glucagon that control blood sugar.",
        """bile""" to "Made by the liver and stored in the gallbladder, it emulsifies fats, breaking them into small droplets so lipase can digest them.",
        """vill(?:i|us)""" to "Finger-like folds lining the small intestine that greatly increase the surface area for absorbing nutrients.",
        """peristalsis""" to "Waves of muscle contraction that push food along the digestive tract.",
        """amylase""" to "The enzyme that breaks starch into sugars, made by the salivary glands and the pancreas.",
        """pepsin""" to "The enzyme in the stomach that starts digesting proteins. It works best in acid.",
        """trypsin""" to "A pancreatic enzyme that digests proteins in the small intestine.",
        """lipase""" to "The enzyme that digests fats into fatty acids and glycerol.",
        """heart""" to "Pumps blood: the right side sends it to the lungs, the left side to the rest of the body.",
        """right atrium""" to "Receives deoxygenated blood from the body through the venae cavae.",
        """left atrium""" to "Receives oxygenated blood from the lungs through the pulmonary veins.",
        """right ventricle""" to "Pumps deoxygenated blood to the lungs through the pulmonary artery.",
        """left ventricle""" to "Pumps oxygenated blood to the whole body through the aorta (systemic circulation). Its wall is the thickest.",
        """aorta""" to "The largest artery, carrying oxygenated blood from the left ventricle to the body.",
        """pulmonary arter(?:y|ies)""" to "Carries deoxygenated blood from the right ventricle to the lungs.",
        """pulmonary veins?""" to "Carry oxygenated blood from the lungs to the left atrium.",
        """venae? cavae?|vena cava""" to "The large veins that bring deoxygenated blood from the body into the right atrium.",
        """(?:heart )?valves?""" to "Flaps that keep blood flowing one way through the heart and stop backflow.",
        """sa node|sinoatrial node""" to "The heart's pacemaker in the right atrium, which starts each heartbeat.",
        """av node|atrioventricular node""" to "Delays the signal from the SA node, then passes it to the ventricles so they contract after the atria.",
        """arter(?:y|ies)""" to "Blood vessels that carry blood away from the heart, with thick, muscular, elastic walls.",
        """veins?""" to "Blood vessels that carry blood back toward the heart, with thin walls and valves.",
        """capillar(?:y|ies)""" to "Tiny vessels one cell thick where oxygen, nutrients and wastes pass between blood and tissues.",
        """red blood cells?|erythrocytes?""" to "Carry oxygen from the lungs to the tissues using hemoglobin. They have no nucleus.",
        """white blood cells?|leukocytes?""" to "Defend the body against infection.",
        """platelets?""" to "Cell fragments that help blood clot.",
        """plasma""" to "The liquid part of blood, mostly water, carrying nutrients, hormones, proteins and wastes.",
        """hemoglobin|haemoglobin""" to "The iron-containing protein in red blood cells that carries oxygen (and some carbon dioxide).",
        """blood pressure""" to "The force of blood against artery walls, given as systolic over diastolic, about 120/80 mmHg.",
        """systole""" to "The phase of the heartbeat when the ventricles contract.",
        """diastole""" to "The phase of the heartbeat when the heart relaxes and fills.",
        """cardiac output""" to "The volume of blood the heart pumps per minute: heart rate times stroke volume, about 5 L/min at rest.",
        """stroke volume""" to "The volume of blood one ventricle pumps per beat, about 70 mL at rest.",
        """lungs?""" to "Exchange gases: oxygen moves into the blood and carbon dioxide moves out, in the alveoli.",
        """alveol(?:i|us)""" to "Tiny air sacs in the lungs where oxygen diffuses into the capillaries and carbon dioxide diffuses out.",
        """trachea""" to "The windpipe, a tube held open by rings of cartilage that carries air to the bronchi.",
        """bronch(?:i|us)""" to "The two airways that branch from the trachea into the lungs.",
        """bronchioles?""" to "Small branching airways in the lungs that end in alveoli.",
        """diaphragm""" to "The main muscle of breathing: it contracts and flattens to pull air in (inhalation) and relaxes to let air out.",
        """epiglottis""" to "A flap that covers the trachea when you swallow so food goes down the esophagus.",
        """kidneys?""" to "Filter the blood to remove urea and other wastes as urine, and balance the body's water, salts and pH.",
        """nephrons?""" to "The functional unit of the kidney, which filters blood and forms urine.",
        """glomerul(?:us|i)""" to "A knot of capillaries in the nephron where blood is filtered under pressure into Bowman's capsule.",
        """(?:the )?loop of henle""" to "The part of the nephron that reabsorbs water and salt, letting the kidney make concentrated urine.",
        """(?:urinary )?bladder""" to "Stores urine until it leaves the body.",
        """ureters?""" to "Tubes that carry urine from each kidney to the bladder.",
        """urethra""" to "The tube that carries urine from the bladder out of the body.",
        """antidiuretic hormone|adh""" to "Makes the kidney's collecting ducts reabsorb more water, so less, more concentrated urine is made. The posterior pituitary releases it when the body is short of water.",
        """aldosterone""" to "A hormone from the adrenal glands that makes the kidneys reabsorb more sodium (and water).",
        """insulin""" to "A hormone from the pancreas that lowers blood sugar by helping cells take up glucose and the liver store it as glycogen.",
        """glucagon""" to "A hormone from the pancreas that raises blood sugar by making the liver break glycogen into glucose.",
        """neurons?""" to "A nerve cell that carries electrical signals (impulses): dendrites receive them, the axon sends them on.",
        """dendrites?""" to "Branches of a neuron that receive signals and carry them toward the cell body.",
        """axons?""" to "The long fibre of a neuron that carries impulses away from the cell body.",
        """(?:the )?myelin(?: sheath)?""" to "A fatty layer that insulates an axon and speeds up the impulse, which jumps between the gaps (nodes of Ranvier).",
        """synapses?""" to "The gap (junction) between a neuron and the next cell, where neurotransmitters carry the signal across.",
        """neurotransmitters?""" to "A chemical messenger, such as acetylcholine, released at a synapse to pass a signal to the next cell.",
        """(?:a )?reflex arc""" to "The nerve pathway of a reflex: sensory neuron to interneuron in the spinal cord to motor neuron, skipping the brain for speed.",
        """cerebrum""" to "The largest part of the brain: thinking, memory, the senses and voluntary movement.",
        """cerebellum""" to "Coordinates movement, balance and posture.",
        """medulla(?: oblongata)?""" to "Controls automatic functions: breathing, heart rate and blood pressure.",
        """hypothalamus""" to "Links the nervous and endocrine systems and controls homeostasis: body temperature, thirst, hunger, and the pituitary gland.",
        """selectively permeable(?: membrane)?|semi-?permeable(?: membrane)?""" to "A membrane that lets some substances cross but not others, as the cell membrane does.",
        """(?:the )?sodium[- ]potassium pump""" to "A carrier protein that uses ATP (active transport) to pump three sodium ions out of the cell and two potassium ions in, against their gradients. It keeps nerve cells ready to fire.",
        """(?:a )?concentration gradient""" to "A difference in concentration between two areas. Substances diffuse down it, from high to low.",
        """(?:the )?primary structure(?: of (?:a )?proteins?)?""" to "The sequence (order) of amino acids in the chain.",
        """(?:the )?secondary structure(?: of (?:a )?proteins?)?""" to "Folding of the chain into alpha helices and beta pleated sheets, held by hydrogen bonds.",
        """(?:the )?tertiary structure(?: of (?:a )?proteins?)?""" to "The overall three-dimensional shape of one folded chain, held by bonds between side chains.",
        """(?:the )?quaternary structure(?: of (?:a )?proteins?)?""" to "Two or more folded chains joined into one protein, like the four chains of hemoglobin.",
        """catalase""" to "An enzyme in liver and other cells that breaks toxic hydrogen peroxide into water and oxygen.",
        """(?:a )?genes?""" to "A section of DNA that codes for one protein (or RNA).",
        """pituitary(?: gland)?""" to "The master gland under the brain. Its posterior lobe releases ADH and oxytocin; its anterior lobe releases growth hormone, TSH, FSH, LH and others.",
        """thyroid(?: gland)?""" to "A gland in the neck that releases thyroxine, which sets the body's metabolic rate.",
        """adrenal glands?""" to "Glands on top of the kidneys that release adrenaline (fight or flight) and aldosterone.",
    ).map { Triple(Regex("^(?:" + it.first + ")$"), it.second, it.first) }

    /** Which terms count as an organelle, a part of the brain, a gland and so on: (question noun, term pattern start). */
    private val kinds = listOf(
        """organelles?|parts? of (?:the |a )?cell|cell parts?|cell structures?""" to """^(?:nucle|mitoch|ribos|rough|smooth|endopl|golgi|lysos|vesic|vacuol|cytosk|centri|chlorop|perox)""",
        """parts? of (?:the )?brain|brain (?:parts?|regions?|structures?)|regions? of (?:the )?brain""" to """^(?:cerebr|cerebel|medulla|hypoth)""",
        """glands?""" to """^(?:pancreas|liver|salivary|pituitary|thyroid|adrenal|hypoth)""",
        """organs?""" to """^(?:mouth|esoph|stomach|small|large|liver|gall|pancreas|heart|lungs|kidney|\(\?:urinary|pituitary|thyroid|adrenal)""",
        """enzymes?""" to """^(?:amylase|pepsin|trypsin|lipase|catalase|helicase|dna polymerase|\(\?:dna \)\?ligase|primase|rna polymerase)""",
        """hormones?""" to """^(?:antidiuretic|aldosterone|insulin|glucagon)""",
        """(?:blood )?vessels?""" to """^(?:aorta|pulmonary|venae|arter|veins|capillar)""",
        """(?:blood )?cells?""" to """^(?:red blood|white blood|platelets|neurons)""",
        """heart chambers?|chambers? of the heart""" to """^(?:right|left) (?:atrium|ventricle)""",
    )

    /** The standard genetic code, mRNA bases in UCAG order: first base, then second, then third. */
    private const val CODE = "FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG"
    private val aminoAcids = mapOf(
        'F' to "Phe phenylalanine",
        'L' to "Leu leucine",
        'S' to "Ser serine",
        'Y' to "Tyr tyrosine",
        'C' to "Cys cysteine",
        'W' to "Trp tryptophan",
        'P' to "Pro proline",
        'H' to "His histidine",
        'Q' to "Gln glutamine",
        'R' to "Arg arginine",
        'I' to "Ile isoleucine",
        'M' to "Met methionine",
        'T' to "Thr threonine",
        'N' to "Asn asparagine",
        'K' to "Lys lysine",
        'V' to "Val valine",
        'A' to "Ala alanine",
        'D' to "Asp aspartic acid",
        'E' to "Glu glutamic acid",
        'G' to "Gly glycine",
    )

    private val stop = "the a an of in is are does do which what that and to from for it its with by on into".split(" ").toSet()

    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble science")
    private fun find(pattern: String, s: String): List<String>? = Regex(pattern).find(s)?.groupValues
    private fun has(pattern: String, s: String) = Regex(pattern).containsMatchIn(s)
    private fun codon(c: String) = CODE["UCAG".indexOf(c[0]) * 16 + "UCAG".indexOf(c[1]) * 4 + "UCAG".indexOf(c[2])]
    private fun cap(s: String) = s.replaceFirstChar { it.uppercase() }

    /** A term's plain name from its pattern: optional parts dropped, the first choice of each group kept. */
    private fun name(s: String) = cap(s.replace(Regex("""\(\?:[^()]*\)\?"""), "").replace(Regex("""\(\?:([^|()]*)[^()]*\)"""), "$1").split("|")[0].replace(Regex(""".\?"""), ""))

    private fun pair(s: String, map: Map<Char, Char>) = s.uppercase().map { map[it] ?: it }.joinToString("")

    fun answer(q: String): Answer? {
        for ((re, body) in facts) if (re.containsMatchIn(q)) return out(body)
        var m: List<String>?
        // "function of the X", "what does X do", "what is X"
        m = find("""^(?:what (?:is|are) )?(?:the )?(?:main )?(?:functions?|roles?|jobs?|purposes?) of (?:the |a |an )?(.+)$""", q)
            ?: find("""^what (?:does|do) (?:the |a |an )?(.+?) (?:do|carry|transport|make|produce|release|secrete|store|control|contain)$""", q)
            ?: find("""^(?:what (?:is|are) |define )?(?:the |a |an )?(.+)$""", q)
        if (m != null) {
            val t = m[1].replace(Regex(""" (?:in|of) (?:the )?(?:body|cell|human body)$"""), "")
            for ((re, body) in terms) if (re.containsMatchIn(t)) return out(body)
        }
        // "which organelle makes ATP": the term of that kind whose description shares the most words with the question,
        // a word counting less the more of those descriptions use it
        for ((kind, names) in kinds) {
            val k = find("^(?:what|which) (?:$kind) (.+)$", q) ?: continue
            val words = k[1].split(Regex("[^a-z0-9]+")).filter { it.length > 2 && it !in stop }.map { it.take(5) }
            val nre = Regex(names)
            val pool = terms.filter { nre.containsMatchIn(it.third) }.map { Triple(it.third, it.second, it.second.lowercase()) }
            fun weight(w: String): Double { val n = pool.count { w in it.third }; return if (n > 0) 1.0 / n else 0.0 }
            var best: Triple<String, String, String>? = null
            var top = 0.0
            var tie = false
            for (t in pool) {
                val n = words.sumOf { if (it in t.third) weight(it) else 0.0 }
                if (n > top + 1e-9) { best = t; top = n; tie = false } else if (abs(n - top) < 1e-9 && n > 0) tie = true
            }
            if (best != null && !tie) return out(name(best.first) + ". " + best.second)
            break
        }
        // complementary DNA strand
        m = find("""\bcomplement(?:ary)?\b.*?\b([acgt]{3,})$""", q)
        if (m != null && !has("""\b(?:rna|mrna)\b""", q)) return out(pair(m[1], mapOf('A' to 'T', 'T' to 'A', 'C' to 'G', 'G' to 'C')))
        // transcription: a template strand pairs (A to U); a coding strand only swaps T for U
        m = find("""\b(?:transcribe|mrna (?:from|for|of|made from|transcribed from))\b.*?\b([acgt]{3,})\b""", q)
        if (m != null) {
            val s = m[1].uppercase()
            if (has("""\bcoding strand\b""", q)) return out(s.replace("T", "U") + " (the coding strand with U for T)")
            return out(pair(s, mapOf('A' to 'U', 'T' to 'A', 'C' to 'G', 'G' to 'C')) + " (read as the template strand: A pairs with U, T with A, C with G)")
        }
        // one codon
        m = find("""\b(?:codon )?([acgu]{3})\b (?:codes?|code for|stands? for|encodes?|specif(?:y|ies))\b""", q) ?: find("""\bcodon ([acgu]{3})\b""", q)
        if (m != null) {
            val c = m[1].uppercase()
            val a = codon(c)
            if (a == '*') return out("Stop: $c is a stop codon and codes for no amino acid.")
            val (ab, full) = aminoAcids.getValue(a).split(" ", limit = 2)
            return out(cap(full) + " ($ab)" + if (a == 'M') ", also the start codon." else ".")
        }
        // translate mRNA in triplets, stopping at a stop codon
        m = find("""\btranslate\b.*?\b([acgu]{3,})\b""", q)
        if (m != null && 'u' in m[1]) {
            val s = m[1].uppercase()
            val aa = mutableListOf<Char>()
            var stopped = false
            var i = 0
            while (i + 3 <= s.length) { val a = codon(s.substring(i, i + 3)); if (a == '*') { stopped = true; break }; aa += a; i += 3 }
            return out(aa.joinToString("-") { aminoAcids.getValue(it).split(" ")[0] } + (if (stopped) "-Stop" else "") +
                " (" + aa.joinToString(", ") { aminoAcids.getValue(it).split(" ", limit = 2)[1] } + (if (stopped) ", then stop" else "") + ")")
        }
        // codons and amino acids: three bases per codon
        m = find("""\bhow many amino acids\b.*?\b(\d+) (?:nucleotides|bases)\b""", q)
        if (m != null) { val n = m[1].toInt() / 3; return out("$n codons, so $n amino acids if every codon codes for one (${n - 1} if the last is a stop codon).") }
        m = find("""\bhow many (?:nucleotides|bases)\b.*?\b(\d+) amino acids\b""", q)
        if (m != null) return out(pcNum(m[1].toDouble() * 3) + " nucleotides (3 per amino acid), plus 3 more for a stop codon.")
        // cardiac output = heart rate x stroke volume
        if (has("""\bcardiac output\b""", q)) {
            val hr = find("""\bheart rate (?:is |of )?(\d+(?:\.\d+)?)""", q)
            val sv = find("""\bstroke volume (?:is |of )?(\d+(?:\.\d+)?)\s*ml\b""", q)
            if (hr != null && sv != null) { val co = hr[1].toDouble() * sv[1].toDouble(); return out(pcNum(co) + " mL/min (" + pcNum(co / 1000) + " L/min; cardiac output = heart rate × stroke volume)") }
        }
        return null
    }
}
