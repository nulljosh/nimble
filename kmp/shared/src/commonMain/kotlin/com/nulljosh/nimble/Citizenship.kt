package com.nulljosh.nimble

/**
 * The Canadian citizenship test with no network, from the study guide Discover Canada: rights and responsibilities,
 * history, government, elections, symbols, geography and the economy, plus every provincial and territorial capital.
 * A port of `citizen()` in docs/engine.js; the tables are copied from there by script.
 */
internal object Citizenship {
    /** Phrase questions, matched anywhere. */
    private val facts = listOf(
        """\brole of (?:the )?courts?\b|\bwhat do (?:the )?courts do\b""" to "Courts settle disputes and interpret and apply the law, independent of government. The Supreme Court of Canada is the highest court.",
        """\bhighest court in canada\b|\bcanada'?s highest court\b""" to "The Supreme Court of Canada, in Ottawa, with nine judges.",
        """\bhead of (?:a |the )?(?:municipal|city|town|local) government\b|\bwho (?:runs|leads) (?:a |the )?(?:city|municipality|town)\b""" to "The mayor (in some rural areas, the reeve), with an elected council.",
        """\bfirst (?:francophone|french[- ]canadian|french[- ]speaking) prime minister\b""" to "Sir Wilfrid Laurier, prime minister from 1896 to 1911, who appears on the \$5 bill.",
        """\bwomen\b.*\b(?:vote|voting|suffrage)\b.*\bfederal|\bfederal\b.*\bwomen\b.*\b(?:vote|voting)\b""" to "1918 for most women: some women got the federal vote in 1917 (nurses and soldiers' relatives), most women in 1918, Quebec women provincially only in 1940.",
        """\bimpact of the first world war\b|\bfirst world war'?s impact\b|\bworld war (?:1|i|one)\b.*\bimpact\b.*\bcanada\b""" to "More than 600,000 Canadians served and over 60,000 died. Victories like Vimy Ridge built a sense of nationhood, women won the vote, conscription split French and English Canada, and Canada signed the peace treaty in its own right.",
        """\bd-?day\b.*\bcanad|\bcanad\w*\b.*\bd-?day\b""" to "June 6, 1944: Canadian troops landed at Juno Beach in Normandy, one of five Allied beaches, and pushed farther inland than any other Allied force that day.",
        """\bwhen did newfoundland\b.*\bjoin\b|\bnewfoundland\b.*\bjoin(?:ed)? (?:canada|confederation)\b""" to "1949, after a referendum, as Canada's tenth province.",
        """\bsmallest province\b""" to "Prince Edward Island, both by area and by population.",
        """\blargest province\b.*\barea\b|\bbiggest province\b.*\b(?:area|size)\b|^largest province$""" to "Quebec, by area. Ontario has the most people.",
        """\bcanadian currency\b|\bcurrency of canada\b|\bcanada'?s currency\b""" to "The Canadian dollar (CAD), with the \$1 coin called the loonie and the \$2 coin the toonie.",
        """\bofficial residence of the prime minister\b|\bwhere does the prime minister live\b""" to "24 Sussex Drive in Ottawa, though it has been closed for repairs since 2015 and prime ministers have lived at Rideau Cottage, on the grounds of Rideau Hall.",
        """\bequality of women and men\b|\bequality between (?:men and women|women and men)\b""" to "In Canada men and women are equal under the law, and spousal abuse, honour killings, female genital mutilation and forced marriage are crimes, as Discover Canada states.",
        """\brole of the senate\b|\bwhat does the senate do\b""" to "To give \"sober second thought\" to bills passed by the House of Commons: senators review, study and may amend bills, and no bill becomes law without the Senate's approval.",
        """\b(?:three )?levels of government\b""" to "Federal (Parliament in Ottawa), provincial or territorial, and municipal (local).",
        """\bvoting age\b""" to "18. You must be a Canadian citizen at least 18 years old on election day to vote in federal elections.",
        """\bhow often (?:are|is)\b.*\b(?:federal )?elections?\b""" to "At least every five years under the Charter, and by law on a fixed date every four years, though an election can be called earlier.",
        """^(?:federal |canadian )?cabinet$|\bcabinet\b.*\b(?:canada|federal|prime minister)\b""" to "The prime minister and the ministers who run the federal government departments and make its key decisions. Ministers are usually MPs, chosen by the prime minister and accountable to the House of Commons.",
        """\b(?:three )?founding peoples\b""" to "Aboriginal peoples, the French and the British. Discover Canada names these three as the founding peoples of Canada.",
        """\bresponsibilit(?:y|ies) of (?:canadian )?citizens(?:hip)?\b|\bcitizens'? responsibilit""" to "Obeying the law, taking responsibility for yourself and your family, serving on a jury when called, voting in elections, helping others in the community, and protecting and enjoying our heritage and environment. Defending Canada is a duty too, though there is no compulsory military service.",
        """\bwho represents the (?:king|queen|monarch|sovereign|crown) in (?:a |each )?provinces?\b""" to "The lieutenant governor, appointed by the governor general on the advice of the prime minister, usually for five years.",
        """\bwho represents the (?:king|queen|monarch|sovereign|crown)(?: in canada)?$""" to "The governor general, appointed by the sovereign on the advice of the prime minister, usually for five years. In each province, the lieutenant governor represents the sovereign.",
        """\b(?:three )?parts of (?:the )?parliament\b""" to "The sovereign (King or Queen), the Senate and the House of Commons.",
        """\brole of the (?:official )?opposition\b|\bwhat does the opposition do\b""" to "To oppose or try to improve the government's proposals, question it in Question Period, and hold it to account. The party with the second-most seats is the Official Opposition.",
        """\bhow (?:are|is) (?:a )?senators? (?:chosen|selected|picked|appointed)\b""" to "Senators are appointed by the governor general on the advice of the prime minister, and serve until age 75.",
        """\bwho (?:can|is allowed to|may) vote\b.*\bfederal\b|\bwho can vote in (?:a )?(?:canadian )?election\b""" to "Canadian citizens who are at least 18 years old on election day and are on the voters' list (or register at the polls).",
        """\b(?:first|original) (?:four|4) provinces\b|\bprovinces? (?:at|in) confederation\b""" to "Ontario, Quebec, Nova Scotia and New Brunswick, united in 1867 at Confederation.",
        """\bcanada'?s first prime minister\b|\bfirst prime minister of canada\b""" to "Sir John A. Macdonald, prime minister from 1867 to 1873 and 1878 to 1891, a Father of Confederation.",
        """\b(?:date of |when is )canada day\b|\bcanada day\b.*\b(?:date|when)\b""" to "July 1, the anniversary of Confederation in 1867.",
        """\bcanada'?s national anthem\b|\bnational anthem of canada\b""" to "\"O Canada\", proclaimed the national anthem in 1980, first sung in Quebec City in 1880.",
        """\broyal anthem\b""" to "\"God Save the King\", the royal anthem of Canada, played to honour the sovereign.",
        """\bcanada'?s motto\b|\bmotto of canada\b|\bnational motto\b""" to "A mari usque ad mare, Latin for \"from sea to sea\".",
        """\blargest province\b.*\bpopulation\b|\bmost populous province\b|\bprovince\b.*\bmost people\b""" to "Ontario, with more than a third of Canada's people.",
        """\bcanada'?s (?:three )?territories\b|\bthree territories\b|\bterritories of canada\b""" to "Yukon, the Northwest Territories and Nunavut.",
        """\b(?:five )?regions of canada\b""" to "The Atlantic Provinces, Central Canada, the Prairie Provinces, the West Coast and the Northern Territories.",
        """\bcapital of british columbia\b|\bcapital of bc\b|\bbc'?s capital\b""" to "Victoria.",
        """\b(?:three )?(?:main )?(?:types of )?industries\b.*\bcanada\b|\bcanada'?s (?:three )?(?:main )?industries\b""" to "Service industries (which employ most Canadians), manufacturing, and natural resources (forestry, fishing, agriculture, mining and energy).",
        """\bcanada'?s (?:largest|biggest|main) trading partner\b""" to "The United States: about three quarters of Canada's exports go there.",
        """\bocean\b.*\bcanada'?s west coast\b|\bwest coast of canada\b.*\bocean\b""" to "The Pacific Ocean.",
        """\bfirst (?:female|woman) prime minister\b""" to "Kim Campbell, in 1993.",
        """\bofficial name of canada'?s (?:armed forces|military)\b|\bcanada'?s (?:armed forces|military)\b.*\bname\b""" to "The Canadian Armed Forces (CAF), with the Royal Canadian Navy, the Canadian Army and the Royal Canadian Air Force.",
        """\b(?:two )?official languages\b""" to "English and French, under the Official Languages Act of 1969.",
        """\boath of citizenship\b|\bcitizenship oath\b""" to "\"I swear (or affirm) that I will be faithful and bear true allegiance to His Majesty King Charles the Third, King of Canada, His Heirs and Successors, and that I will faithfully observe the laws of Canada, including the Constitution, which recognizes and affirms the Aboriginal and treaty rights of First Nations, Inuit and Métis peoples, and fulfil my duties as a Canadian citizen.\"",
        """\bhighest (?:honou?r|award|decoration)\b.*\bcanad|\bcanada'?s highest (?:honou?r|award|decoration)\b""" to "The Victoria Cross, for the most conspicuous bravery in the presence of the enemy. Ninety-nine Canadians have received it.",
        """\brights of (?:canadian )?citizens\b|\bcitizens'? rights\b|\brights (?:do )?canadians have\b""" to "Rights in the Charter include freedom of conscience, religion, thought, belief, opinion, expression, peaceful assembly and association; mobility rights (to live and work anywhere in Canada and to enter and leave it); Aboriginal peoples' rights; official language rights; minority language education rights; democratic rights such as voting; legal rights; and equality rights.",
        """\b(?:type|kind|form|system) of government\b.*\bcanada\b|\bcanada'?s (?:system of )?government\b""" to "Canada is a federal state, a parliamentary democracy and a constitutional monarchy, with the King as head of state and an elected Parliament.",
        """\bhow many provinces\b.*\bcanada\b|^how many provinces(?: are there)?$""" to "Ten provinces (and three territories).",
        """\bwhen did canada become a (?:country|nation)\b|\bwhen was canada (?:founded|created|formed)\b""" to "July 1, 1867, at Confederation, when the Dominion of Canada was formed.",
        """\b(?:the )?war of 1812\b""" to "The United States invaded Canada in 1812. Canadians, British troops, First Nations led by Tecumseh, and militia defended it, and the Americans were driven back by 1814. It helped define Canada's independence from the United States.",
        """\b(?:national|official) (?:flower|tree|symbol)\b.*\bcanada\b|\bcanada'?s (?:national|official) (?:flower|tree|symbol)\b|\bofficial flower symbol\b""" to "The maple leaf, Canada's best-known symbol, on the flag since 1965. The maple tree is the national tree.",
        """\bnational winter sport\b""" to "Ice hockey.",
        """\bnational summer sport\b""" to "Lacrosse, an ancient sport first played by Aboriginal peoples.",
        """\bcolou?rs? of the (?:canadian )?flag\b|\bcanadian flag\b.*\bcolou?rs?\b|\bcanada'?s (?:official )?colou?rs\b""" to "Red and white, the official colours of Canada, with a red maple leaf on a white square between two red bars.",
        """\blargest city in canada\b|\bcanada'?s largest city\b|\bbiggest city in canada\b""" to "Toronto.",
        """\bcapital of nunavut\b""" to "Iqaluit.",
        """\bcapital of nova scotia\b""" to "Halifax.",
        """\bprairie provinces\b""" to "Manitoba, Saskatchewan and Alberta.",
        """\bocean\b.*\bcanada'?s east coast\b|\beast coast of canada\b.*\bocean\b""" to "The Atlantic Ocean.",
        """\bocean\b.*\bcanada'?s north(?:ern)? coast\b|\bnorth(?:ern)? coast of canada\b.*\bocean\b""" to "The Arctic Ocean.",
        """\blongest river in canada\b|\bcanada'?s longest river\b""" to "The Mackenzie River, about 4,241 km with its headwaters, flowing to the Arctic Ocean.",
        """\b(?:most populous|largest|biggest) city in (?:british columbia|bc)\b""" to "Vancouver, with about 2.6 million people in Metro Vancouver.",
        """\b(?:only )?(?:officially )?bilingual province\b""" to "New Brunswick, the only officially bilingual province.",
        """\bcanada'?s population\b|\bpopulation of canada\b""" to "About 41 million people (2025), most living within a few hundred kilometres of the US border.",
        """\bbeaver\b.*\bsymbol\b|\bsymbol\b.*\bbeaver\b""" to "Canada: the beaver was adopted by the Hudson's Bay Company and the fur trade, and is an official national emblem.",
        """\bduties of (?:a |an )?(?:member of parliament|mp)\b|\bwhat (?:do|does) (?:a |an )?(?:mps?|members? of parliament) do\b""" to "To represent the people of their riding in the House of Commons, debate and vote on bills (pass laws), and help constituents with federal matters.",
        """\bloses a (?:vote of )?confidence(?: vote)?\b|\bnon-?confidence\b""" to "The prime minister must resign or ask the governor general to call an election: a government stays in power only while it has the confidence of the House of Commons.",
        """\bhow (?:is|does) a bill (?:passed|become a law)\b|\bhow (?:are|do) (?:laws|bills) (?:passed|made)\b""" to "A bill goes through three readings and committee study in the House of Commons, then the same in the Senate, and becomes law when the governor general gives royal assent.",
        """\bhappened at vimy ridge\b|\bvimy ridge\b""" to "In April 1917 the four divisions of the Canadian Corps, fighting together for the first time, captured Vimy Ridge in France, with about 10,600 killed and wounded. It became a symbol of Canadian nationhood.",
    ).map { Regex(it.first) to it.second }

    /** People, events and symbols, matched as the whole term by Terms. */
    private val terms = listOf(
        """(?:the )?act of union(?: of 1840)?""" to "The 1840 British law that joined Upper Canada and Lower Canada into the Province of Canada, after the rebellions of 1837 and 1838.",
        """(?:the )?fathers of confederation""" to "The 36 representatives of the British North American colonies who met at Charlottetown and Quebec City in 1864 and London in 1866 to work out Confederation, among them John A. Macdonald, George-Étienne Cartier and George Brown.",
        """(?:the )?(?:united empire )?loyalists""" to "Colonists who stayed loyal to the Crown during the American Revolution and moved north, more than 40,000 of them, to Nova Scotia and Quebec in the 1780s, including Joseph Brant's Mohawk Loyalists.",
        """(?:the )?canadian pacific railway""" to "The railway across Canada, finished in 1885 when the last spike was driven at Craigellachie, BC. It linked British Columbia to the rest of Canada, as promised when BC joined in 1871.",
        """(?:the )?battle of the plains of abraham|(?:the )?plains of abraham""" to "The 1759 battle at Quebec City in which British forces under General James Wolfe defeated the French under the Marquis de Montcalm, both of whom died. It ended French rule in North America.",
        """(?:the )?victoria cross""" to "The highest honour in Canada and the Commonwealth, for the most conspicuous bravery in the face of the enemy. Ninety-nine Canadians have received it.",
        """(?:samuel de )?champlain""" to "The French explorer who founded Quebec City in 1608, the first permanent European settlement in Canada, and is called the Father of New France.",
        """jacques cartier""" to "The French explorer who made three voyages to the St. Lawrence from 1534 to 1542, claimed the land for France and gave Canada its name, from the Iroquoian word kanata, \"village\".",
        """john cabot|giovanni caboto""" to "The Italian explorer sailing for England who reached Newfoundland's coast in 1497, the first European to map Canada's Atlantic shore.",
        """(?:the )?quebec act(?: of 1774)?""" to "The 1774 British law that let French Canadians keep their Catholic faith, French civil law and the seigneurial system, to win their loyalty.",
        """(?:the )?constitutional act(?: of 1791)?""" to "The 1791 British law that split the Province of Quebec into Upper Canada (later Ontario) and Lower Canada (later Quebec), each with an elected assembly.",
        """agnes macphail""" to "The first woman elected to the House of Commons, in 1921, a farmer and teacher from Ontario.",
        """(?:the )?quiet revolution""" to "The rapid change in Quebec in the 1960s, when the province modernized, the government took over education and health from the Church, and Quebec nationalism grew.",
        """(?:the )?canadian shield|(?:the )?laurentian (?:shield|plateau)""" to "The huge region of ancient Precambrian rock around Hudson Bay covering about half of Canada, rich in minerals, forests and lakes.",
        """(?:the )?coat of arms of canada|canada'?s coat of arms|(?:the )?(?:royal )?arms of canada""" to "Canada's official symbol of sovereignty, granted in 1921, with the symbols of England, Scotland, Ireland and France, red maple leaves, a lion and a unicorn, the crown and the motto A mari usque ad mare.",
        """(?:the )?rcmp|(?:the )?royal canadian mounted police|(?:the )?mounties""" to "The Royal Canadian Mounted Police, Canada's national police force, founded in 1873 as the North-West Mounted Police. It polices federal laws everywhere and acts as the provincial police in most provinces, including BC.",
        """(?:the )?order of canada""" to "Canada's highest civilian honour, created in 1967, for outstanding achievement and service to the country or humanity.",
        """(?:the )?magna carta""" to "The Great Charter, signed by King John of England in 1215, which put the king under the law and is the root of rights such as habeas corpus and the presumption of innocence. Discover Canada traces Canadian freedoms back to it.",
        """confederation|(?:canadian )?confederation""" to "The union of the British North American colonies into the Dominion of Canada on July 1, 1867, under the British North America Act: Ontario, Quebec, Nova Scotia and New Brunswick at first, with the other provinces and territories joining later.",
        """(?:the )?great lakes""" to "Five connected freshwater lakes on the Canada-US border: Superior, Michigan (wholly in the US), Huron, Erie and Ontario, together the largest group of freshwater lakes on Earth.",
        """(?:a )?ridings?|(?:an )?electoral districts?|(?:a )?constituenc(?:y|ies)""" to "A geographical area that elects one member of Parliament (MP). There are 343 federal ridings.",
        """(?:a )?secret ballots?""" to "Voting in private, so no one can see how you vote or make you reveal it. It is guaranteed in Canadian elections.",
        """(?:the )?voyageurs?""" to "French-Canadian canoemen who carried furs and trade goods by canoe between Montreal and the fur country of the West in the fur trade.",
        """(?:the )?underground railroad""" to "A secret network that helped tens of thousands of slaves escape from the United States to freedom in Canada in the 1800s.",
        """laura secord""" to "A pioneer wife and mother who walked 30 km in 1813, during the War of 1812, to warn the British of a planned American attack.",
        """(?:sir )?isaac brock""" to "The British major-general who captured Detroit in 1812 and was killed leading the defence of Canada at Queenston Heights, near Niagara Falls.",
        """remembrance day""" to "November 11, when Canadians remember the sacrifices of veterans and the brave men and women who served and died in wars, wearing red poppies and pausing for a minute of silence at 11 am.",
    ).map { Triple(Regex("^(?:" + it.first + ")$"), it.second, it.first) }

    private val capitals = mapOf(
        "canada" to "Ottawa",
        "alberta" to "Edmonton",
        "british columbia" to "Victoria",
        "bc" to "Victoria",
        "manitoba" to "Winnipeg",
        "new brunswick" to "Fredericton",
        "newfoundland and labrador" to "St. John's",
        "newfoundland" to "St. John's",
        "nova scotia" to "Halifax",
        "ontario" to "Toronto",
        "prince edward island" to "Charlottetown",
        "pei" to "Charlottetown",
        "quebec" to "Quebec City",
        "saskatchewan" to "Regina",
        "yukon" to "Whitehorse",
        "the yukon" to "Whitehorse",
        "northwest territories" to "Yellowknife",
        "the northwest territories" to "Yellowknife",
        "nwt" to "Yellowknife",
        "nunavut" to "Iqaluit",
    )
    private val capitalAsk = Regex("""^(?:what is )?(?:the )?capital (?:city )?of (?:the province of |the territory of )?([a-z. ]+?)(?: province| territory)?$""")

    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble citizenship")

    fun answer(q: String): Answer? {
        capitalAsk.find(q)?.let { m -> capitals[m.groupValues[1]]?.let { return out("$it.") } }
        for ((re, body) in facts) if (re.containsMatchIn(q)) return out(body)
        val t = q.replace(Regex("^(?:who|what) (?:was|were|is|are) "), "").replace(Regex(" in canada$"), "")
        return Terms.answer(t, terms, emptyList())?.let { out(it) }
    }
}
