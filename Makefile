DATE = $(shell date +%y%m%d.%H%M)
OUTPUT = archives/open-pinnedtab-link.$(DATE).zip
FILES = manifest.json options.html migration.html $(wildcard scripts/*.js css/*.css icons/* _locales/*/messages.json)

$(OUTPUT): $(FILES)
	mkdir -p archives
	zip -FS $@ $(FILES)
