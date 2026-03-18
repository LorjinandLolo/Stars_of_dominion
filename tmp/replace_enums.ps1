$filePath = 'c:\Users\lorij\OneDrive\Desktop\Star_of_Dom\lib\ui-mock-data.ts'
$content = Get-Content -Path $filePath -Raw

# Replace CharterPower enum usages with strings
$content = $content -replace "CharterPower\.MONOPOLY", "'MONOPOLY'"
$content = $content -replace "CharterPower\.GOVERNANCE", "'GOVERNANCE'"
$content = $content -replace "CharterPower\.PARAMILITARY", "'PARAMILITARY'"

# Replace Resource enum usages with strings
$content = $content -replace "Resource\.METALS", "'METALS'"
$content = $content -replace "Resource\.CHEMICALS", "'CHEMICALS'"
$content = $content -replace "Resource\.FOOD", "'FOOD'"
$content = $content -replace "Resource\.ENERGY", "'ENERGY'"
$content = $content -replace "Resource\.RARES", "'RARES'"

$content | Set-Content -Path $filePath -NoNewline -Encoding utf8
