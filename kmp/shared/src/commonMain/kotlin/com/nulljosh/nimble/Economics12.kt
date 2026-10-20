package com.nulljosh.nimble

import com.nulljosh.nimble.Precalc.pcNum
import kotlin.math.round

/**
 * BC Economic Theory 12 with no network: scarcity and choice, economic systems, supply and demand, elasticity, market
 * structures, costs, market failure, GDP, inflation, unemployment, fiscal and monetary policy, money and trade, plus
 * price and income elasticity, total revenue, CPI inflation, real GDP and the unemployment rate. A port of
 * `econ12()` in docs/engine.js; the tables are copied from there by script.
 */
internal object Economics12 {
    /** Phrase questions, matched anywhere. */
    private val facts = listOf(
        """\bgoods? (?:and|vs\.?|versus) (?:a )?services?\b""" to "A good is a tangible, physical product you can hold, like a phone or a loaf of bread. A service is an intangible activity done for you, like a haircut, a lesson or medical care.",
        """\bincome approach\b""" to "GDP measured by adding up all the incomes earned producing it: wages and salaries, corporate profits, interest and rent, plus adjustments for depreciation and indirect taxes. It gives the same total as the expenditure approach.",
        """\bmicro ?economics\b.*\bmacro ?economics\b|\bmacro ?economics\b.*\bmicro ?economics\b""" to "Microeconomics studies the choices of individual households, firms and markets, such as how a price is set. Macroeconomics studies the economy as a whole: GDP, inflation, unemployment, interest rates and government policy.",
        """\b(?:cause|shift)s? (?:a |the )?(?:shift in |shifts? (?:of|in) )?(?:the )?demand curve\b|\bdemand curve\b.*\bshift|\bdeterminants of demand\b""" to "Anything other than the good's own price: consumer income, tastes and preferences, the prices of related goods (substitutes and complements), expectations about future prices, and the number of buyers. A change in the good's own price moves along the curve instead.",
        """\bchange in demand\b.*\bchange in (?:the )?quantity demanded\b|\bchange in (?:the )?quantity demanded\b.*\bchange in demand\b""" to "A change in quantity demanded is a movement along the demand curve caused by a change in the good's own price. A change in demand is a shift of the whole curve, left or right, caused by something else, such as income, tastes or the price of a related good.",
        """\b(?:law of )?diminishing (?:marginal )?returns\b""" to "As more of one input, such as workers, is added to a fixed input, such as a factory, the extra output from each additional unit eventually gets smaller.",
        """\b(?:four |4 )?factors of production\b""" to "Land (natural resources), labour (human work), capital (tools, machines and buildings used to make other goods) and entrepreneurship (the risk-taking that combines the other three to start and run a business).",
        """\b(?:three |3 )?functions of money\b""" to "A medium of exchange (accepted in trade for goods and services), a store of value (it keeps its worth over time) and a unit of account (a common measure of prices).",
        """\bexpenditure approach\b""" to "GDP = C + I + G + (X - M): consumer spending, plus business investment, plus government spending on goods and services, plus net exports (exports minus imports).",
        """^(?:what is )?(?:the )?law of demand$|^law of demand\b""" to "When the price of a good rises, the quantity demanded falls, and when the price falls, the quantity demanded rises, other things equal: an inverse relationship, so the demand curve slopes down.",
        """^(?:what is )?(?:the )?law of supply$|^law of supply\b""" to "When the price of a good rises, producers supply more of it, and when it falls they supply less, other things equal: a direct relationship, so the supply curve slopes up.",
    ).map { Regex(it.first) to it.second }

    /** Economic terms, matched as the whole term by Terms. */
    private val terms = listOf(
        """scarcity""" to "The basic economic problem: people's wants are unlimited, but the resources to satisfy them (land, labour, capital and entrepreneurship) are limited, so every society must choose what to produce, how and for whom.",
        """opportunity cost""" to "The value of the next best alternative you give up when you make a choice. The opportunity cost of an evening studying might be the wages you could have earned working that shift.",
        """(?:a )?production possibilit(?:y|ies) (?:curve|frontier|boundary)|(?:a )?ppc|(?:a )?ppf""" to "A graph showing the maximum combinations of two goods an economy can produce with its resources and technology. Points on the curve are efficient, inside it are inefficient, outside it are unreachable, and its slope shows the opportunity cost.",
        """(?:a )?(?:free )?market economy|capitalism""" to "An economic system where private individuals and firms own resources and decide what to produce, guided by prices set by supply and demand, with little government control.",
        """(?:a )?command economy|(?:a )?planned economy|(?:a )?centrally planned economy""" to "An economic system where the government owns most resources and central planners decide what is produced, how and for whom, as in the Soviet Union or North Korea.",
        """(?:market )?equilibrium(?: price)?""" to "The price at which the quantity demanded equals the quantity supplied, where the supply and demand curves cross. At that price the market clears, with no shortage or surplus.",
        """(?:a )?(?:market )?surplus|(?:an )?excess supply""" to "When the quantity supplied is greater than the quantity demanded, because the price is above equilibrium. Sellers have unsold goods, which pushes the price down.",
        """(?:a )?price ceilings?""" to "A legal maximum price set below the equilibrium price, such as rent control. It causes a shortage, because more is demanded than supplied at that price.",
        """(?:the )?(?:price )?elasticity of demand|ped""" to "How much the quantity demanded responds to a change in price: the percentage change in quantity demanded divided by the percentage change in price. Above 1 is elastic (very responsive); below 1 is inelastic.",
        """(?:an )?inelastic (?:goods?|demand)""" to "Demand that barely changes when price changes, with an elasticity below 1, typical of necessities with few substitutes such as insulin, gasoline or salt. Raising the price raises total revenue.",
        """(?:a )?substitutes?(?: goods?)?""" to "A good that can be used instead of another, like coffee and tea or butter and margarine. If the price of one rises, demand for the other rises.",
        """(?:a )?normal goods?""" to "A good people buy more of when their income rises, such as restaurant meals or new clothes.",
        """perfect competition|(?:a )?perfectly competitive market""" to "A market with many small firms selling identical products, free entry and exit and full information, so every firm is a price taker. Agricultural markets come close.",
        """(?:a )?monopol(?:y|ies)""" to "A market with a single seller of a product with no close substitutes, protected by barriers to entry. A monopoly is a price maker and tends to charge more and produce less than a competitive market.",
        """(?:an )?oligopol(?:y|ies)""" to "A market dominated by a few large firms, each of which must consider its rivals' reactions, like Canada's banks, airlines and phone companies.",
        """fixed costs?""" to "Costs that do not change with the amount produced in the short run, such as rent, insurance and loan payments. They must be paid even if output is zero.",
        """marginal costs?""" to "The extra cost of producing one more unit of output: the change in total cost divided by the change in quantity.",
        """(?:an )?externalit(?:y|ies)""" to "A cost or benefit of an activity that falls on a third party who is not part of the deal, such as pollution from a factory (negative) or the benefit to others when you get vaccinated (positive).",
        """(?:a )?public goods?""" to "A good that is non-excludable (no one can be kept from using it) and non-rival (one person's use does not reduce another's), such as national defence or a lighthouse. Markets underprovide them because of free riders, so governments supply them.",
        """gdp|gross domestic product""" to "Gross domestic product: the total market value of all final goods and services produced within a country in a year, the main measure of the size of an economy. Canada's is about \$3 trillion.",
        """real gdp""" to "GDP adjusted for inflation, measured in the prices of a base year, so it shows changes in actual output rather than in prices. Real GDP = nominal GDP ÷ GDP deflator × 100.",
        """inflation""" to "A sustained rise in the general level of prices, which reduces what money can buy. In Canada it is measured by the Consumer Price Index, and the Bank of Canada aims to keep it at 2 percent a year.",
        """(?:the )?consumer price index|cpi""" to "A measure of the average change in prices of a fixed basket of goods and services households buy, such as food, shelter and transport, published monthly by Statistics Canada. Its yearly change is the inflation rate.",
        """(?:the )?unemployment rate""" to "The share of the labour force that is unemployed (without work but actively looking): unemployed ÷ labour force × 100. Canada's is usually around 5 to 7 percent.",
        """cyclical unemployment""" to "Unemployment caused by a downturn in the business cycle, when demand for goods falls in a recession and firms lay workers off. It falls again when the economy recovers.",
        """(?:the )?business cycle|(?:the )?economic cycle""" to "The rise and fall of economic activity over time: expansion (growth), peak, contraction or recession, and trough, then recovery.",
        """fiscal policy""" to "The government's use of spending and taxation to influence the economy: more spending or lower taxes to fight a recession, less spending or higher taxes to cool inflation.",
        """monetary policy""" to "A central bank's use of interest rates and the money supply to influence the economy. The Bank of Canada raises its policy rate to fight inflation and cuts it to boost a weak economy.",
        """(?:the )?bank of canada""" to "Canada's central bank, founded in 1934 in Ottawa. It sets the policy interest rate to keep inflation near 2 percent, issues bank notes and oversees the financial system.",
        """comparative advantage""" to "The ability to produce a good at a lower opportunity cost than another producer. Countries gain from trade by specializing in what they have a comparative advantage in, even if another country is better at everything.",
        """(?:a )?tariffs?""" to "A tax on imported goods. It raises the price of imports, protecting domestic producers, but makes consumers pay more.",
        """(?:a )?trade deficits?""" to "When the value of a country's imports exceeds the value of its exports over a period. The opposite is a trade surplus.",
        """economics""" to "The study of how people, businesses and governments make choices about using scarce resources to satisfy unlimited wants: what to produce, how to produce it and for whom.",
        """(?:a )?mixed economy""" to "An economic system that combines free markets with government involvement, such as regulation, public services and social programs. Canada has a mixed economy, like most countries.",
        """(?:a )?traditional economy""" to "An economic system where what is produced and how is decided by custom and tradition passed down through generations, often based on farming, hunting or fishing.",
        """(?:the )?invisible hand""" to "Adam Smith's idea from The Wealth of Nations (1776) that people pursuing their own self-interest in a free market are led, as if by an invisible hand, to benefit society as a whole.",
        """(?:a )?(?:market )?shortage|(?:an )?excess demand""" to "When the quantity demanded is greater than the quantity supplied, because the price is below equilibrium. Buyers cannot get all they want, which pushes the price up.",
        """(?:a )?price floors?""" to "A legal minimum price set above the equilibrium price, such as the minimum wage or farm price supports. It causes a surplus, because more is supplied than demanded at that price.",
        """elastic demand|(?:an )?elastic goods?""" to "Demand that is very responsive to price, with an elasticity greater than 1, typical of luxuries and goods with many substitutes. Raising the price lowers total revenue.",
        """(?:a )?complementary goods?|complements? in economics""" to "Goods used together, like cars and gasoline or printers and ink. If the price of one rises, demand for the other falls.",
        """(?:an )?inferior goods?""" to "A good people buy less of when their income rises, because they switch to better options, such as instant noodles or bus rides.",
        """monopolistic competition""" to "A market with many firms selling similar but differentiated products, such as restaurants, hair salons and clothing brands, with easy entry and some control over price through branding.",
        """(?:a )?cartels?""" to "A group of firms or countries that agree to fix prices or limit output to act like a monopoly, such as OPEC for oil. Cartels between firms are illegal in Canada under the Competition Act.",
        """(?:a )?barriers? to entry""" to "Anything that makes it hard for new firms to enter a market: high start-up costs, patents, government licences, control of key resources, or the economies of scale of existing firms.",
        """variable costs?""" to "Costs that change with the amount produced, such as raw materials, hourly wages and energy. They are zero when output is zero.",
        """economies of scale""" to "The fall in average cost per unit as a firm produces more, from bulk buying, specialized machines and spreading fixed costs. Past some size, diseconomies of scale can raise costs again.",
        """(?:a )?negative externalit(?:y|ies)""" to "A cost that falls on third parties outside a transaction, such as pollution, noise or traffic congestion. The market overproduces the good, which a carbon tax or regulation can correct.",
        """(?:a )?positive externalit(?:y|ies)""" to "A benefit that goes to third parties outside a transaction, such as education or vaccination. The market underproduces the good, which subsidies can correct.",
        """nominal gdp""" to "GDP measured in current prices, not adjusted for inflation, so it can rise just because prices rose.",
        """gdp per capita|per capita gdp""" to "GDP divided by the population: the average output per person, a rough measure of the standard of living.",
        """(?:the )?gdp deflator|(?:the )?implicit price deflator""" to "A price index for everything in GDP: nominal GDP ÷ real GDP × 100. Real GDP = nominal GDP ÷ deflator × 100.",
        """deflation""" to "A sustained fall in the general level of prices, the opposite of inflation. It can hurt an economy because people delay spending and debts become harder to repay.",
        """stagflation""" to "High inflation together with high unemployment and stagnant growth, as in the 1970s after the oil price shocks. It is hard to fix because the usual remedies for one make the other worse.",
        """hyperinflation""" to "Extremely rapid inflation, often defined as over 50 percent a month, usually from printing money, as in Germany in 1923 or Zimbabwe in 2008.",
        """frictional unemployment""" to "Short-term unemployment of people between jobs or entering the workforce, searching for the right job. It exists even in a healthy economy.",
        """structural unemployment""" to "Long-term unemployment when workers' skills or locations no longer match the jobs available, because of new technology or the decline of an industry.",
        """(?:a )?recessions?""" to "A significant decline in economic activity, often defined as two consecutive quarters of falling real GDP, with rising unemployment.",
        """expansionary fiscal policy""" to "Government action to stimulate a weak economy: increase spending, cut taxes or both, usually running a deficit.",
        """contractionary fiscal policy""" to "Government action to cool an overheating economy and inflation by cutting spending or raising taxes.",
        """(?:the )?overnight rate|(?:the )?(?:bank of canada'?s )?policy (?:interest )?rate|(?:the )?target for the overnight rate""" to "The interest rate at which major banks lend to each other overnight, set as a target by the Bank of Canada eight times a year. It is the Bank's main tool of monetary policy and drives prime rates and mortgage rates.",
        """quantitative easing|qe""" to "When a central bank creates money to buy government bonds and other assets in large amounts, pushing down long-term interest rates to stimulate the economy when its policy rate is already near zero, as the Bank of Canada did in 2020.",
        """(?:the )?(?:spending |fiscal |keynesian )multiplier(?: effect)?|(?:the )?multiplier effect""" to "The idea that an initial change in spending causes a larger total change in GDP, because each dollar spent becomes someone's income and is partly spent again. Multiplier = 1 ÷ (1 - marginal propensity to consume).",
        """absolute advantage""" to "The ability to produce more of a good than another producer with the same resources, or the same amount with fewer resources.",
        """free trade""" to "Trade between countries without tariffs, quotas or other barriers, which lets each specialize in its comparative advantage.",
        """cusma|usmca|(?:the )?canada[- ]united states[- ]mexico agreement""" to "The Canada-United States-Mexico Agreement, the free trade deal that replaced NAFTA in July 2020.",
        """nafta|(?:the )?north american free trade agreement""" to "The North American Free Trade Agreement among Canada, the United States and Mexico, in force from 1994 until CUSMA replaced it in 2020.",
        """(?:an )?exchange rates?""" to "The price of one currency in terms of another, such as how many US dollars one Canadian dollar buys. Canada's dollar floats, set by supply and demand.",
        """protectionism""" to "Government policies that shield domestic industries from foreign competition, using tariffs, import quotas and subsidies.",
        """(?:a )?trade-?offs?""" to "A choice where you give up some of one thing to get more of another, because resources are scarce. Every trade-off has an opportunity cost.",
        """(?:the )?marginal benefits?""" to "The additional benefit or satisfaction from consuming or producing one more unit. People choose well by doing more of something while its marginal benefit exceeds its marginal cost.",
        """consumer surplus""" to "The difference between the most a consumer is willing to pay for a good and the price they actually pay, the area under the demand curve and above the price.",
        """producer surplus""" to "The difference between the price a producer receives and the minimum they would be willing to accept, the area above the supply curve and below the price.",
        """income elasticity(?: of demand)?""" to "How much the quantity demanded responds to a change in income: the percentage change in quantity demanded divided by the percentage change in income. Positive for normal goods (above 1 for luxuries), negative for inferior goods.",
        """cross[- ]price elasticity(?: of demand)?|cross elasticity(?: of demand)?""" to "How much the quantity demanded of one good responds to a change in the price of another: percentage change in quantity of A ÷ percentage change in price of B. Positive for substitutes, negative for complements.",
        """total revenue""" to "The money a firm takes in from sales: price × quantity sold.",
        """average (?:total )?costs?""" to "Total cost divided by the quantity of output: the cost per unit.",
        """(?:a )?natural monopol(?:y|ies)""" to "A market where one firm can supply everyone at a lower cost than several could, because of huge fixed costs and economies of scale, such as water, power lines or rail track. They are usually regulated or publicly owned, like BC Hydro.",
        """(?:a )?carbon tax(?:es)?|carbon pricing""" to "A tax on burning fossil fuels based on the carbon dioxide they release, to make polluters pay the cost of the negative externality and cut emissions. BC brought in North America's first broad carbon tax in 2008.",
        """(?:the )?free[- ]rider problem|free riders?""" to "When people benefit from a good without paying for it, so no one has an incentive to pay and the market underprovides it, a key reason governments supply public goods.",
        """gnp|gross national product""" to "The total value of goods and services produced by a country's citizens and businesses, at home or abroad, in a year: GDP plus income earned abroad by residents, minus income earned at home by foreigners. Canada now calls it gross national income.",
        """cost[- ]push inflation""" to "Inflation caused by rising costs of production, such as higher wages or a jump in oil prices, which firms pass on as higher prices, shifting aggregate supply left.",
        """demand[- ]pull inflation""" to "Inflation caused when aggregate demand grows faster than the economy can produce, \"too much money chasing too few goods\", pulling prices up.",
        """(?:the )?(?:labour|labor) force participation rate|(?:the )?participation rate""" to "The share of the working-age population (15 and older in Canada) that is in the labour force, either working or looking for work: labour force ÷ working-age population × 100. Canada's is about 65 percent.",
        """(?:the )?natural rate of unemployment|full employment""" to "The unemployment rate when the economy is at full employment, with only frictional and structural unemployment and no cyclical unemployment, about 5 to 6 percent in Canada.",
        """(?:a )?budget deficits?""" to "When a government spends more than it collects in revenue in a year, so it must borrow the difference. The opposite is a budget surplus.",
        """(?:the )?national debt|(?:the )?(?:federal |public |government )debt""" to "The total amount a government owes, built up from past budget deficits minus surpluses. Canada's federal debt is over \$1 trillion.",
        """contractionary monetary policy|tight monetary policy""" to "A central bank raising interest rates or reducing the money supply to cool the economy and bring inflation down.",
        """expansionary monetary policy|easy monetary policy""" to "A central bank cutting interest rates or increasing the money supply to boost spending and fight a recession.",
        """(?:the )?prime (?:lending )?rate""" to "The interest rate banks charge their most creditworthy customers, set by each bank and moving with the Bank of Canada's policy rate, usually about 2 percentage points above it. Many loans and lines of credit are priced from it.",
        """(?:a )?commercial banks?|(?:a )?chartered banks?""" to "A private bank that takes deposits and makes loans to individuals and businesses, profiting from the difference in interest. Canada's big chartered banks include RBC, TD, Scotiabank, BMO and CIBC.",
        """fractional[- ]reserve banking""" to "A system in which banks keep only a fraction of their deposits as reserves and lend out the rest, which creates money as loans are re-deposited and lent again.",
        """aggregate demand""" to "The total demand for all goods and services in an economy at each price level: AD = C + I + G + (X - M).",
        """aggregate supply""" to "The total output of goods and services all firms in an economy will produce at each price level.",
        """keynesian economics|keynesianism""" to "The theory of John Maynard Keynes, from the 1930s, that total demand drives output and jobs in the short run, so governments should spend more and run deficits in recessions to boost demand, and cut back in booms.",
        """supply[- ]side economics|reaganomics""" to "The view that growth comes from boosting production through lower taxes, less regulation and incentives to work, save and invest, linked to Reagan and Thatcher in the 1980s.",
        """(?:the )?balance of payments""" to "A record of all of a country's transactions with the rest of the world over a period: the current account (trade in goods and services, income and transfers) and the capital and financial account (investment flows). It always balances overall.",
        """(?:a )?currency appreciation|appreciation of (?:a |the )?currency""" to "A rise in the value of a currency against others, so it buys more foreign currency. It makes imports cheaper and exports more expensive. The opposite is depreciation.",
        """(?:an )?embargo(?:es)?|(?:a )?trade embargo(?:es)?""" to "A government ban on trade with a particular country, or in particular goods, usually for political reasons, such as the US embargo on Cuba.",
        """(?:a )?subsid(?:y|ies)""" to "A payment from the government to producers or consumers to lower costs and encourage production or use of a good, such as for electric vehicles or farming.",
        """(?:a )?sales tax(?:es)?""" to "A tax added to the price of goods and services when they are bought. In BC that is the 5 percent federal GST plus the 7 percent provincial PST.",
        """(?:economic )?profit|profit in economics|(?:accounting )?profit""" to "Total revenue minus total cost. Accounting profit subtracts only explicit costs; economic profit also subtracts opportunity costs, such as the owner's forgone wages.",
        """market failure""" to "When a free market does not allocate resources efficiently on its own, because of externalities, public goods, monopoly power or missing information, which can justify government action.",
        """(?:the )?world trade organi[sz]ation|(?:the )?wto""" to "The international body, founded in 1995 in Geneva and replacing the GATT, that sets the rules for trade between its 160-plus member countries, negotiates lower trade barriers and settles trade disputes.",
        """(?:the )?demand curve""" to "A graph of how much of a good buyers will purchase at each price. It slopes down because of the law of demand.",
        """(?:the )?supply curve""" to "A graph of how much of a good sellers will offer at each price. It slopes up because of the law of supply.",
        """(?:a )?quotas?(?: on imports)?|(?:an )?import quotas?""" to "A legal limit on the quantity of a good that can be imported, used to protect domestic producers.",
    ).map { Triple(Regex("^(?:" + it.first + ")$"), it.second, it.first) }

    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble economics")
    private fun p(v: Double, digits: Int) = pcNum(Precalc.sig(v, digits).toDouble())
    private fun has(re: String, q: String) = Regex(re).containsMatchIn(q)

    private val pricePct = Regex("""\bprice\b[^%]*?(\d+(?:\.\d+)?)\s*(?:%|percent)""")
    private val incomePct = Regex("""\bincome\b[^%]*?(\d+(?:\.\d+)?)\s*(?:%|percent)""")
    private val quantityPct = Regex("""\bquantity\b[^%]*?(\d+(?:\.\d+)?)\s*(?:%|percent)""")
    private val sales = Regex("""\b(\d[\d,]*)\s*(?:units?|items?|tickets?|products?)\b.*?\$\s*(\d+(?:\.\d+)?)""")
    private val fromTo = Regex("""\bfrom (\d+(?:\.\d+)?) to (\d+(?:\.\d+)?)\b""")
    private val nominal = Regex("""\bnominal gdp\b[^\d]*(\d[\d,]*(?:\.\d+)?)\s*(trillion|billion|million)?""")
    private val deflator = Regex("""\bdeflator\b[^\d]*(\d+(?:\.\d+)?)""")
    private val unemployed = Regex("""(\d+(?:\.\d+)?)\s*(million|thousand)?\s*(?:people )?(?:are |were )?unemployed\b""")
    private val labourForce = Regex("""\blabou?r force\b[^\d]*(\d+(?:\.\d+)?)\s*(million|thousand)?""")

    fun answer(q: String): Answer? {
        for ((re, body) in facts) if (re.containsMatchIn(q)) return out(body)
        Terms.answer(q.replace(Regex(" in economics$"), ""), terms, emptyList())?.let { return out(it) }
        // price elasticity of demand = % change in quantity ÷ % change in price
        if (has("""\belasticity\b""", q) && !has("""\bincome\b""", q)) {
            val pr = pricePct.find(q)?.groupValues?.get(1)
            val d = quantityPct.find(q)?.groupValues?.get(1)
            if (pr != null && d != null && pr.toDouble() > 0) {
                val v = d.toDouble() / pr.toDouble()
                return out(p(v, 4) + " (" + d + "% ÷ " + pr + "%), so demand is " + (if (v > 1) "elastic" else if (v < 1) "inelastic" else "unit elastic") + ". Strictly the value is negative, since price and quantity move in opposite directions.")
            }
        }
        // income elasticity = % change in quantity ÷ % change in income
        if (has("""\belasticity\b""", q) && has("""\bincome\b""", q)) {
            val i = incomePct.find(q)?.groupValues?.get(1)
            val d = quantityPct.find(q)?.groupValues?.get(1)
            if (i != null && d != null && i.toDouble() > 0) {
                val v = (if (has("""\bquantity\b[^%]*?\b(?:fall|falls|fell|drop|drops|decreas\w*|declin\w*)\b""", q)) -1 else 1) * d.toDouble() / i.toDouble()
                return out(p(v, 4) + " (" + d + "% ÷ " + i + "%), so it is " + (if (v < 0) "an inferior good" else if (v > 1) "a normal good and a luxury" else "a normal good and a necessity") + ".")
            }
        }
        // total revenue = price × quantity
        if (has("""\b(?:total )?revenue\b""", q)) sales.find(q)?.let { m ->
            val (n, pr) = m.destructured
            return out("$" + pcNum(round(n.replace(",", "").toDouble() * pr.toDouble() * 100) / 100) + " (price × quantity = $" + pr + " × " + n + ").")
        }
        // inflation rate from the CPI: (new - old) ÷ old × 100
        if (has("""\bcpi\b|\bconsumer price index\b|\bprice index\b""", q) && has("""\binflation\b""", q)) fromTo.find(q)?.let { m ->
            val (a, b) = m.destructured
            if (a.toDouble() > 0) return out(p((b.toDouble() - a.toDouble()) / a.toDouble() * 100, 6) + "% ((" + b + " - " + a + ") ÷ " + a + " × 100).")
        }
        // real GDP = nominal GDP ÷ deflator × 100
        if (has("""\breal gdp\b""", q)) nominal.find(q)?.let { m ->
            val d = deflator.find(q)?.groupValues?.get(1)?.toDouble()
            if (d != null && d > 0) return out(p(m.groupValues[1].replace(",", "").toDouble() / d * 100, 6) + (if (m.groupValues[2].isNotEmpty()) " " + m.groupValues[2] else "") + " (nominal GDP ÷ deflator × 100).")
        }
        // unemployment rate = unemployed ÷ labour force × 100
        if (has("""\bunemployment rate\b""", q)) {
            fun n(m: MatchResult) = m.groupValues[1].toDouble() * when (m.groupValues[2]) { "million" -> 1e6; "thousand" -> 1e3; else -> 1.0 }
            val u = unemployed.find(q)
            val l = labourForce.find(q)
            if (u != null && l != null && n(l) > 0) return out(p(n(u) / n(l) * 100, 6) + "% (unemployed ÷ labour force × 100).")
        }
        return null
    }
}
