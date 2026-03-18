$filePath = 'c:\Users\lorij\OneDrive\Desktop\Star_of_Dom\lib\ui-mock-data.ts'
$lines = Get-Content -Path $filePath
$cleanLines = @()

# We want to keep everything up to mockDiscourseState or so.
# Let's find the line where mockDiscourseState starts.
$discourseIndex = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -like '*export const mockDiscourseState*') {
        $discourseIndex = $i
        break
    }
}

if ($discourseIndex -ge 0) {
    # Keep up to just before discourse
    for ($i = 0; $i -lt $discourseIndex; $i++) {
        $cleanLines += $lines[$i]
    }
    
    # Append the clean discourse and corporate states
    $cleanLines += "export const mockDiscourseState: DiscourseState = {"
    $cleanLines += "    activeFactionId: 'military',"
    $cleanLines += "    messages: {"
    $cleanLines += "        'military': ["
    $cleanLines += "            { id: 'm1', speaker: 'faction', content: 'Supreme Hegemon, the fleet is ready for your command, but the logistics are strained.', timestamp: 1773664309.84656000 },"
    $cleanLines += "        ]"
    $cleanLines += "    },"
    $cleanLines += "    isGenerating: false"
    $cleanLines += "};"
    $cleanLines += ""
    $cleanLines += "export const mockCorporateState: CorporateState = {"
    $cleanLines += "    companies: ["
    $cleanLines += "        {"
    $cleanLines += "            id: 'company-aurelian-spice',"
    $cleanLines += "            fullName: 'Aurelian Spice Charter Company',"
    $cleanLines += "            foundingFactionId: 'faction-aurelian',"
    $cleanLines += "            sharePrice: 24.80,"
    $cleanLines += "            sharePricePrev: 22.10,"
    $cleanLines += "            sharesOutstanding: 1_000_000,"
    $cleanLines += "            treasury: 420_000,"
    $cleanLines += "            dividendsPaidTotal: 65_000,"
    $cleanLines += "            privateFleetSize: 18,"
    $cleanLines += "            autonomyLevel: 45,"
    $cleanLines += "            corruptionIndex: 22,"
    $cleanLines += "            activeTradeRouteIds: ['route-1', 'route-2'],"
    $cleanLines += "            monopolySystemsCount: 4,"
    $cleanLines += "            corporateColoniesCount: 2,"
    $cleanLines += "            powers: [CharterPower.MONOPOLY, CharterPower.GOVERNANCE],"
    $cleanLines += "        },"
    $cleanLines += "        {"
    $cleanLines += "            id: 'company-vektori-deep-rim',"
    $cleanLines += "            fullName: 'Vektori Deep Rim Charter Company',"
    $cleanLines += "            foundingFactionId: 'faction-vektori',"
    $cleanLines += "            sharePrice: 11.30,"
    $cleanLines += "            sharePricePrev: 13.40,"
    $cleanLines += "            sharesOutstanding: 2_000_000,"
    $cleanLines += "            treasury: 198_000,"
    $cleanLines += "            dividendsPaidTotal: 21_000,"
    $cleanLines += "            privateFleetSize: 7,"
    $cleanLines += "            autonomyLevel: 72,"
    $cleanLines += "            corruptionIndex: 58,"
    $cleanLines += "            activeTradeRouteIds: ['route-3'],"
    $cleanLines += "            monopolySystemsCount: 2,"
    $cleanLines += "            corporateColoniesCount: 0,"
    $cleanLines += "            powers: [CharterPower.MONOPOLY, CharterPower.PARAMILITARY],"
    $cleanLines += "        },"
    $cleanLines += "        {"
    $cleanLines += "            id: 'company-covenant-relics',"
    $cleanLines += "            fullName: 'Covenant Relics Charter Company',"
    $cleanLines += "            foundingFactionId: 'faction-covenant',"
    $cleanLines += "            sharePrice: 18.60,"
    $cleanLines += "            sharePricePrev: 18.55,"
    $cleanLines += "            sharesOutstanding: 500_000,"
    $cleanLines += "            treasury: 312_000,"
    $cleanLines += "            dividendsPaidTotal: 48_000,"
    $cleanLines += "            privateFleetSize: 12,"
    $cleanLines += "            autonomyLevel: 30,"
    $cleanLines += "            corruptionIndex: 5,"
    $cleanLines += "            activeTradeRouteIds: ['route-4', 'route-5', 'route-6'],"
    $cleanLines += "            monopolySystemsCount: 6,"
    $cleanLines += "            corporateColoniesCount: 1,"
    $cleanLines += "            powers: [CharterPower.MONOPOLY, CharterPower.GOVERNANCE],"
    $cleanLines += "        },"
    $cleanLines += "    ],"
    $cleanLines += "    markets: ["
    $cleanLines += "        { resource: Resource.METALS, currentPrice: 13.4, basePrice: 10, supply: 18400, demand: 21200 },"
    $cleanLines += "        { resource: Resource.CHEMICALS, currentPrice: 8.7, basePrice: 10, supply: 22000, demand: 17500 },"
    $cleanLines += "        { resource: Resource.FOOD, currentPrice: 16.2, basePrice: 10, supply: 9800, demand: 14300 },"
    $cleanLines += "        { resource: Resource.ENERGY, currentPrice: 11.1, basePrice: 10, supply: 15000, demand: 15900 },"
    $cleanLines += "        { resource: Resource.RARES, currentPrice: 32.6, basePrice: 10, supply: 3200, demand: 5100 },"
    $cleanLines += "    ],"
    $cleanLines += "    playerPortfolioValue: 125000,"
    $cleanLines += "    totalDividendsReceived: 12400,"
    $cleanLines += "};"
    
    $cleanLines | Set-Content -Path $filePath -Encoding utf8
} else {
    Write-Error "Could not find mockDiscourseState"
}
